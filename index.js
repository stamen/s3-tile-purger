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

module.exports = function(options, callback) {
  if (options.extension &&
      options.extension.indexOf(".") !== 0) {
    options.extension = "." + options.extension;
  }

  options.depth = "depth" in options ? options.depth : Infinity;

  var deletedKeyCount = 0,
      seenKeyCount = 0,
      seenPrefixCount = 0,
      emitter = new events.EventEmitter();

  var deleteQueue = async.queue(function(task, done) {
    if (task.objects.length === 0) {
      return done();
    }

    return client.deleteObjects({
      Bucket: S3_BUCKET,
      Delete: {
        Objects: task.objects,
        Quiet: true
      }
    }, function(err) {
      if (err) {
        console.error(err.stack);
        return done(err);
      }

      deletedKeyCount += task.objects.length;

      emitter.emit("status", {
        deleted: deletedKeyCount,
        keys: seenKeyCount,
        prefixes: seenPrefixCount
      });

      return done();
    });
  }, 100);

  var listQueue = async.queue(function(task, done) {
    return client.listObjects(task, function(err, data) {
      if (err) {
        console.error(err.stack);
        return done(err);
      }

      // drop into "subdirectories"
      data.CommonPrefixes.forEach(function(x) {
        x.Bucket = S3_BUCKET;
        if (x.Prefix.match(/\//g).length <= options.depth) {
          x.Delimiter = task.Delimiter;
        }
        listQueue.push(x);
      });

      seenKeyCount += data.Contents.length;
      seenPrefixCount += data.CommonPrefixes.length;

      emitter.emit("status", {
        deleted: deletedKeyCount,
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

        listQueue.push(task);
      }

      var objects = data.Contents
        .filter(function(x) {
          // only match the provided extension
          return !options.extension ||
                options.extension === path.extname(x.Key);
        })
        .filter(function(x) {
          // only match objects older than minAge
          var age = ~~(Date.now() / 1000 - x.LastModified.getTime() / 1000);

          return !options.minAge ||
                age > options.minAge;
        })
        .map(function(x) {
          return {
            Key: x.Key
          };
        });

      deleteQueue.push({
        objects: objects
      });

      return done();
    });
  }, 100);

  listQueue.push({
    Bucket: S3_BUCKET,
    Prefix: options.prefix || "",
    Delimiter: "/"
  });

  listQueue.drain = function() {
    if (deleteQueue.length() === 0 &&
        deleteQueue.running() === 0) {
      return callback(null, deletedKeyCount);
    }

    // at this point, potentially many deletions have been queued up, so we
    // can wait for the queue to announce that it has drained and return
    deleteQueue.drain = function() {
      return callback(null, deletedKeyCount);
    };
  };

  return emitter;
};
