"use strict";

var util = require("util");

var async = require("async");

var visit = require("../visit");

module.exports = function(commander) {
  commander
    .command("ls")
    .description("List tiles")
    .action(function(cmd) {
      // remove leading slashes if necessary
      var style = cmd.parent.style.replace(/^\/*/, ""),
          minZoom = cmd.parent.minZoom,
          maxZoom = cmd.parent.maxZoom,
          zoomLevels = [];

      for (var z = minZoom; z <= maxZoom; z++) {
        zoomLevels.push(z);
      }

      if (style === "*") {
        visit({
          depth: 2, // loop through a zoom at a time
          zoomLevels: zoomLevels
        }).on("data", console.log);
      } else {
        return async.each(zoomLevels, function(z, callback) {
          var prefix = [style, z].filter(function(x) {
            return x !== undefined;
          }).join("/") + "/";

          visit({
            prefix: prefix
          }).on("data", console.log);
        });
      }
    });
};
