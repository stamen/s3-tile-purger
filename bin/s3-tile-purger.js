#!/usr/bin/env node

"use strict";

var async = require("async"),
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

var zoomLevels = [];

for (var z = minZoom; z <= maxZoom; z++) {
  zoomLevels.push(z);
}

async.each(zoomLevels, function(z, callback) {
  var prefix = [style, z].filter(function(x) {
    return x !== undefined;
  }).join("/") + "/";

  console.log("Purging '%s'...", prefix);

  return purge({
    prefix: prefix,
    extension: argv.extension,
    minAge: argv.a
  }, callback);
}, function(err) {
  if (err) {
    throw err;
  }
});

