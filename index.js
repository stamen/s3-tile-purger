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

        count = keys.length;
        marker = data.Marker;

        return client.deleteMultiple(keys, function(err) {
          process.stdout.write(".");
          deletedKeyCount += keys.length;

          return next(err);
        });
      });
    },
    function() { return count > 0; },
    function(err) {
      clearInterval(interval);

      if (err) {
        console.error(err);
      }

      console.log();
      console.log("Deleted %d/%d keys from '%s'.", deletedKeyCount, seenKeyCount, options.prefix);
      return callback(null, deletedKeyCount);
    });
};
