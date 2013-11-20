"use strict";

var path = require("path");

var async = require("async"),
    AWS = require("aws-sdk"),
    env = require("require-env");

AWS.config.update({
  region: process.env.AWS_DEFAULT_REGION || "us-east-1"
});

var S3_BUCKET = env.require("S3_BUCKET");

var client = new AWS.S3();

module.exports = function(options, callback) {
  if (options.extension &&
      options.extension.indexOf(".") !== 0) {
    options.extension = "." + options.extension;
  }

  var count,
      deletedKeyCount = 0,
      seenKeyCount = 0,
      truncated,
      marker;

  var interval = setInterval(function() {
    console.log("Deleted %d/%d keys from '%s'.", deletedKeyCount, seenKeyCount, options.prefix);
  }, 10000).unref();

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
      process.stdout.write(".");
      deletedKeyCount += task.objects.length;

      return done(err);
    });
  }, 20);

  var listQueue = async.queue(function(task, done) {
    var marker,
        truncated;

    return async.doWhilst(
      function(next) {
        task.Marker = marker || "";

        return client.listObjects(task, function(err, data) {
          if (err) {
            return next(err);
          }

          // drop into "subdirectories"
          data.CommonPrefixes.forEach(function(x) {
            x.Bucket = S3_BUCKET;
            listQueue.push(x);
          });

          seenKeyCount += data.Contents.length;
          seenKeyCount += data.CommonPrefixes.length;

          truncated = data.IsTruncated;

          if (truncated) {
            // lexicographically "last" key
            marker = [
              data.Contents.slice(-1).Key,
              data.CommonPrefixes.slice(-1).Key
            ].sort().slice(-1);
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

          return next();
        });
      },
      function() {
        return truncated;
      }, done);
  }, 20);

  listQueue.push({
    Bucket: S3_BUCKET,
    Prefix: options.prefix,
    Delimiter: "/"
  });

  listQueue.drain = function() {
    var done = function() {
      clearInterval(interval);

      console.log();
      console.log("Deleted %d/%d keys from '%s'.", deletedKeyCount, seenKeyCount, options.prefix);
      return callback.apply(null, arguments);
    };

    if (deleteQueue.length() === 0 &&
        deleteQueue.running() === 0) {
      return done(null, deletedKeyCount);
    }

    // at this point, potentially many deletions have been queued up, so we
    // can wait for the queue to announce that it has drained and return
    deleteQueue.drain = function() {
      return done(null, deletedKeyCount);
    };
  };
};
