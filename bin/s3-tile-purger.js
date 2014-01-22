#!/usr/bin/env node
"use strict";

var commander = require("commander");

// suppress EPIPE errors
process.stdout.on("error", function(err) {
  if (err.code === "EPIPE") {
    process.exit();
  }

  throw err;
});

// general exception handler (allows all commands to throw errors)
process.on("uncaughtException", function(err) {
  console.error(err.stack);
  process.exit(1);
});

commander
  .option("-s, --style <style>", "Style name", "")
  .option("-e, --extension <extension>", "Extension")
  .option("-z, --min-zoom <min zoom>", "Min zoom (inclusive). Defaults to 0.", 0)
  .option("-Z, --max-zoom <max zoom>", "Max zoom (inclusive). Defaults to 22.", 22);

require("../lib/commands/dynamic")(commander);
require("../lib/commands/ls")(commander);
require("../lib/commands/meta")(commander);
require("../lib/commands/purge")(commander);
require("../lib/commands/update-storage-class")(commander);

commander.parse(process.argv);

if (commander.args.length === 0) {
  commander.help();
}
