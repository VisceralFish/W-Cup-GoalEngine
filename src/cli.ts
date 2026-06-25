#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { simulate } from "./engine.js";
import type { QuarterGoalEngineInput } from "./types.js";

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error(
      "Usage: w-cup-goal-engine <input.json> or npm run simulate -- <input.json>",
    );
  }

  const rawInput = await readFile(inputPath, "utf8");
  const input = JSON.parse(rawInput) as QuarterGoalEngineInput;
  const output = simulate(input);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});

