// Check a saved run: node js/replay.js receipt.json
// A matching receipt exits 0. The game records the same seed and moves.

import { readFileSync } from "node:fs";
import { verifyRun } from "./engine.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node js/replay.js receipt.json");
  process.exit(2);
}

const run = JSON.parse(readFileSync(file, "utf8"));
const result = verifyRun(run.seed, run.inputs || [], run.tick, run.score, run.bands, run.hash);
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(result.ok ? 0 : 1);
