"use strict";

var util = require("util");

var async = require("async"),
    AWS = require("aws-sdk"),
    env = require("require-env"),
    multimeter = require("multimeter");

var visit = require("../visit");

AWS.config.update({
  region: process.env.AWS_DEFAULT_REGION || "us-east-1"
});

var S3_BUCKET = env.require("S3_BUCKET");

var client = new AWS.S3();

var updateQueue = async.queue(function(task, done) {
  console.log("Degrading %s", task.Key);
  return client.copyObject({
    Bucket: S3_BUCKET,
    CopySource: [S3_BUCKET, task.Key].join("/"),
    Key: task.Key,
    StorageClass: "REDUCED_REDUNDANCY" // TODO make this configurable
  }, done);
}, 100);

module.exports = function(commander) {
  commander
    .command("update-storage-class")
    .description("Update objects' storage class.")
    .action(function(cmd) {
      // remove leading slashes if necessary
      var style = cmd.parent.style.replace(/^\/*/, ""),
          minZoom = cmd.parent.minZoom,
          maxZoom = cmd.parent.maxZoom,
          zoomLevels = [];

      for (var z = minZoom; z <= maxZoom; z++) {
        zoomLevels.push(z);
      }

      var visitor = function(obj) {
        if (obj.StorageClass !== "REDUCED_REDUNDANCY") {
          updateQueue.push(obj);
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
