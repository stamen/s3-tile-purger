#!/usr/bin/env node

"use strict";

var util = require("util");

var async = require("async"),
    multimeter = require("multimeter"),
    optimist = require("optimist");

var purge = require("../");

var argv = optimist
  .usage("Usage: $0 [-s <style>] [-e <extension>] [-z <min zoom>] [-Z <max zoom] [-a <min age>]")
  .alias("s", "style")
  .describe("s", "Style name.")
  .alias("e", "extension")
  .describe("e", "File extension.")
  .alias("z", "min-zoom")
  .describe("z", "Min zoom (inclusive). Defaults to 0.")
  .alias("Z", "max-zoom")
  .describe("Z", "Max zoom (inclusive). Defaults to 22.")
  .alias("a", "min-age")
  .describe("a", "Delete items older than this (seconds).")
  .argv;

var minZoom = argv.z === undefined ? 0 : argv.z,
    maxZoom = argv.Z === undefined ? 22 : argv.Z,
    style = argv.style;

// remove a leading slash if necessary
if (style && style.indexOf("/") === 0) {
  style = style.slice(1);
}

var multi = multimeter(process),
    zoomLevels = [];

for (var z = minZoom; z <= maxZoom; z++) {
  zoomLevels.push(z);
}

multi.write("Purge Status\n");

if (style === "*") {
  var purger = purge({
    extension: argv.extension,
    minAge: argv.a,
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
      return x !== undefined;
    }).join("/") + "/";

    var purger = purge({
      prefix: prefix,
      extension: argv.extension,
      minAge: argv.a
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
