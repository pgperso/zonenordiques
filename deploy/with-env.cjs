// node with-env.cjs <env-file>... :: <script> [args...]
//
// Loads KEY="value" env files into process.env, then runs <script> in this
// same process. Variables already in the environment win (so PM2's PORT and
// HOSTNAME cannot be overridden by an env file).
//
// Why not `node --env-file`: Next.js forwards the parent's execArgv to its
// worker threads, and Node rejects --env-file there
// (ERR_WORKER_INVALID_EXEC_ARGV), so the build and server die at startup.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');

const argv = process.argv.slice(2);
const sep = argv.indexOf('::');
if (sep < 1 || sep === argv.length - 1) {
  console.error('usage: node with-env.cjs <env-file>... :: <script> [args...]');
  process.exit(2);
}

for (const file of argv.slice(0, sep)) {
  const vars = parseEnv(fs.readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(vars)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const script = path.resolve(argv[sep + 1]);
process.argv = [process.argv[0], script, ...argv.slice(sep + 2)];
require(script);
