"use strict";

var path = require("path");

var async = require("async"),
    knox = require("knox"),
    env = require("require-env");

var client = knox.createClient({
  key: env.require("AWS_ACCESS_KEY_ID"),
  secret: env.require("AWS_SECRET_ACCESS_KEY"),
  bucket: env.require("S3_BUCKET")
});

module.exports = function(options, callback) {
  if (options.extension &&
      options.extension.indexOf(".") !== 0) {
    options.extension = "." + options.extension;
  }

  var count,
      deletedKeyCount = 0,
      seenKeyCount = 0,
      marker;

  var interval = setInterval(function() {
    console.log("Deleted %d/%d keys from '%s'.", deletedKeyCount, seenKeyCount, options.prefix);
  }, 10000).unref();

  var deleteQueue = async.queue(function(task, done) {
    return client.deleteMultiple(task.keys, function(err) {
      process.stdout.write(".");
      deletedKeyCount += task.keys.length;

      return done(err);
    });
  }, 20);

  return async.doWhilst(
    function(next) {
      return client.list({
        marker: marker || "",
        prefix: options.prefix
      }, function(err, data) {
        if (err) {
          return next(err);
        }

        seenKeyCount += data.Contents.length;
        count = data.Contents.length;

        var keys = data.Contents
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
            return x.Key;
          });

        marker = data.Marker;

        if (keys.length > 0) {
          deleteQueue.push({ keys: keys });
        }

        return next();
      });
    },
    function() { return count > 0; },
    function(err) {
      if (err) {
        console.error(err);
      }

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
    });
};
