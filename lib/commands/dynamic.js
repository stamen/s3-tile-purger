"use strict";

var util = require("util");

var async = require("async"),
    AWS = require("aws-sdk"),
    env = require("require-env"),
    mercator = new (require("sphericalmercator"))(),
    multimeter = require("multimeter");

var visit = require("../visit");

AWS.config.update({
  region: process.env.AWS_DEFAULT_REGION || "us-east-1"
});

var S3_BUCKET = env.require("S3_BUCKET");

var client = new AWS.S3();

var deleteQueue = async.queue(function(task, done) {
  console.log("Deleting %s", task.Key);
  return client.deleteObject({
    Bucket: S3_BUCKET,
    Key: task.Key
  }, done);
}, 100);

var updateQueue = async.queue(function(task, done) {
  client.headObject({
    Bucket: S3_BUCKET,
    Key: task.Key
  }, function(err, obj) {
    if (obj.ContentType === "binary/octet-stream") {
      deleteQueue.push(task);
      return done();
    }

    var meta = obj.Metadata;
    meta["surrogate-control"] = "max-age=2592000";

    return client.copyObject({
      ACL: "public-read",
      Bucket: S3_BUCKET,
      CacheControl: obj.CacheControl,
      CopySource: [S3_BUCKET, task.Key].join("/"),
      ContentType: obj.ContentType,
      Key: task.Key,
      Metadata: meta,
      MetadataDirective: "REPLACE",
      StorageClass: "REDUCED_REDUNDANCY" // TODO make this configurable
    }, function(err) {
      if (err) {
        throw err;
      }

      console.log("Updated %s", task.Key);
      return done();
    });
  });
}, 100);

module.exports = function(commander) {
  commander
    .command("dynamic")
    .description("Do stuff to objects")
    .action(function(cmd) {
      // remove leading slashes if necessary
      var style = cmd.parent.style.replace(/^\/*/, ""),
          minZoom = cmd.parent.minZoom,
          maxZoom = cmd.parent.maxZoom,
          zoomLevels = [];

      for (var z = minZoom; z <= maxZoom; z++) {
        zoomLevels.push(z);
      }

      var extent = mercator.bbox(0, 0, 0);

      // TODO instead of defining a visitor here, allow a js file to be
      // provided as an arg and use that
      var visitor = function(obj) {
        var coords = obj.Key.split("/").slice(-3).map(function(x) {
          return x.split(".")[0];
        }).map(function(x) {
          return x | 0;
        });

        // delete tiles with negative coordinates
        var negative = coords.some(function(x) {
          return x < 0;
        });

        if (negative) {
          return deleteQueue.push(obj);
        }

        var bbox = mercator.bbox(coords[1], coords[2], coords[0]);

        // see if the tile's bounding box is fully outside a normal spherical
        // mercator extent
        if (coords.length === 3 &&
            !(bbox[0] >= extent[0] &&
              bbox[1] >= extent[1] &&
              bbox[2] <= extent[2] &&
              bbox[3] <= extent[3])) {
          return deleteQueue.push(obj);
        }

        if (obj.StorageClass !== "REDUCED_REDUNDANCY") {
          return updateQueue.push(obj);
        }
      };

      if (style === "*") {
        visit({
          depth: 1, // loop through a zoom at a time
          zoomLevels: zoomLevels
        }).on("data", visitor);
      } else {
        return async.each(zoomLevels, function(z, callback) {
          var prefix = [style, z].filter(function(x) {
            return x !== undefined;
          }).join("/") + "/";

          visit({
            prefix: prefix
          }).on("data", visitor);
        });
      }
    });
};
