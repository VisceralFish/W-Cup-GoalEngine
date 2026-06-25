import assert from "node:assert/strict";
import test from "node:test";
import {
  fitLambdas,
  normalizeOdds1x2,
  simulate,
} from "../dist/index.js";

const input = {
  match: {
    homeTeam: "Germany",
    awayTeam: "Ecuador",
    stage: "group",
    groupRound: 3,
  },
  markets: {
    lottery: {
      odds1x2: { homeWin: 1.45, draw: 4.1, awayWin: 6.2 },
    },
    international: {
      odds1x2: { homeWin: 1.5, draw: 4, awayWin: 6 },
    },
  },
  simulation: {
    simulations: 2_000,
    seed: 42,
  },
};

test("normalizes 1X2 odds after removing overround", () => {
  const probabilities = normalizeOdds1x2({
    homeWin: 1.8,
    draw: 3.4,
    awayWin: 4.8,
  });

  assert.ok(
    Math.abs(
      probabilities.homeWin +
        probabilities.draw +
        probabilities.awayWin -
        1,
    ) < 1e-12,
  );
  assert.ok(Math.abs(probabilities.homeWin - 0.5251) < 0.001);
});

test("fits a stronger home team with a larger home lambda", () => {
  const target = normalizeOdds1x2(input.markets.international.odds1x2);
  const result = fitLambdas(target);

  assert.ok(result.lambdaHome > result.lambdaAway);
  assert.ok(result.loss < 0.005);
});

test("produces deterministic simulation output for a seed", () => {
  assert.deepEqual(simulate(input), simulate(input));
});

test("accounts for every simulated match", () => {
  const result = simulate(input);
  const count = result.scoreDistribution.reduce(
    (sum, score) => sum + score.count,
    0,
  );
  const probability = result.scoreDistribution.reduce(
    (sum, score) => sum + score.probability,
    0,
  );

  assert.equal(count, input.simulation.simulations);
  assert.ok(Math.abs(probability - 1) < 1e-12);
});

test("rejects invalid odds", () => {
  const invalid = structuredClone(input);
  invalid.markets.international.odds1x2.homeWin = 1;

  assert.throws(() => simulate(invalid), /greater than 1/);
});

