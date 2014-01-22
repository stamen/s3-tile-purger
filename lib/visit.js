"use strict";

var events = require("events"),
    http = require("http"),
    path = require("path");

var async = require("async"),
    AWS = require("aws-sdk"),
    env = require("require-env");

AWS.config.update({
  region: process.env.AWS_DEFAULT_REGION || "us-east-1"
});

http.globalAgent.maxSockets = 200;

var S3_BUCKET = env.require("S3_BUCKET");

var client = new AWS.S3();

module.exports = function(options, visitor, done) {
  done = done || function() {};

  options.depth = "depth" in options ? options.depth : Infinity;
  options.zoomLevels = options.zoomLevels || [];
  // coerce all zooms to strings for comparison with path components
  options.zoomLevels = options.zoomLevels.map(function(x) {
    return x.toString();
  });

  var seenKeyCount = 0,
      seenPrefixCount = 0,
      emitter = new events.EventEmitter();

  var queueTask = function(task) {
    if (listQueue.length() > 0) {
      return setTimeout(function() {
        queueTask(task);
      }, 100);
    }

    listQueue.push(task);
  };

  var listQueue = async.queue(function(task, done) {
    return client.listObjects(task, function(err, data) {
      if (err) {
        console.error(err.stack);
        return done(err);
      }

      process.stdout.write(".");

      // drop into "subdirectories"
      data.CommonPrefixes.forEach(function(x) {
        var components = x.Prefix.split("/").filter(function(component) {
              return !!component;
            }),
            depth = components.length;

        if (depth === 2 &&
            options.zoomLevels.length > 0 &&
            options.zoomLevels.indexOf(components[1]) < 0) {
          return;
        }

        x.Bucket = S3_BUCKET;
        if (depth <= options.depth) {
          x.Delimiter = task.Delimiter;
        }

        listQueue.push(x);
      });

      seenKeyCount += data.Contents.length;
      seenPrefixCount += data.CommonPrefixes.length;

      emitter.emit("status", {
        keys: seenKeyCount,
        prefixes: seenPrefixCount
      });

      if (data.IsTruncated) {
        // lexicographically "last" key
        var marker = [
          data.Contents.slice(-1).pop(),
          data.CommonPrefixes.slice(-1).pop()
        ].filter(function(x) {
          return x !== undefined;
        }).map(function(x) {
          return x.Key || x.Prefix;
        }).sort().slice(-1).pop();

        task.Marker = marker;

        queueTask(task);
      }

      data.Contents.forEach(function(obj) {
        emitter.emit("data", obj);
      });

      return done();
    });
  }, 10);

  listQueue.push({
    Bucket: S3_BUCKET,
    Prefix: options.prefix || "",
    Delimiter: "/"
  });

  listQueue.drain = function() {
    return done();
  };

  return emitter;
};
