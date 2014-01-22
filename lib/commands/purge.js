"use strict";

var util = require("util");

var async = require("async"),
    multimeter = require("multimeter");

var purge = require("../purge");

module.exports = function(commander) {
  commander
    .command("purge")
    .description("Purge tiles")
    .option("-a, --min-age <min age>", "Minimum age of objects to delete (seconds).", 0)
    .action(function(cmd) {
      // remove leading slashes if necessary
      var style = cmd.parent.style.replace(/^\/*/, ""),
          minZoom = cmd.parent.minZoom,
          maxZoom = cmd.parent.maxZoom,
          extension = cmd.parent.extension,
          minAge = cmd.minAge,
          multi = multimeter(process),
          zoomLevels = [];

      for (var z = minZoom; z <= maxZoom; z++) {
        zoomLevels.push(z);
      }

      if (style === "*") {
        var purger = purge({
          extension: extension,
          minAge: minAge,
          depth: 1 // loop through a zoom at a time
        }, function() {
          multi.destroy();
        });

        multi.write(style + "\n");

        var bar = multi.rel(3, 0, {
          width: 60
        });

        purger.on("status", function(status) {
          bar.ratio(status.deleted, status.keys || 1, util.format("%d / %d / %d", status.deleted, status.keys, status.prefixes));
        });
      } else {
        var offset = 0;

        async.each(zoomLevels, function(z, callback) {
          var prefix = [style, z].filter(function(x) {
            return !!x;
          }).join("/") + "/";

          var purger = purge({
            prefix: prefix,
            extension: extension,
            minAge: minAge
          }, callback);

          multi.write(prefix.slice(0, -1) + "\n");

          var bar = multi.rel((style || "").length + 5, zoomLevels.length - offset++, {
            width: 60
          });

          purger.on("status", function(status) {
            bar.ratio(status.deleted, status.keys || 1, util.format("%d / %d / %d", status.deleted, status.keys, status.prefixes));
          });
        }, function(err) {
          if (err) {
            throw err;
          }

          multi.destroy();
        });
      }
    });
};
