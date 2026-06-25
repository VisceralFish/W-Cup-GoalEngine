import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTeamCondition,
  calibrateMarkets,
  fitLambdas,
  normalizeMarket,
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

const advancedInput = {
  match: {
    homeTeam: "Germany",
    awayTeam: "Ecuador",
    stage: "group",
    groupRound: 3,
  },
  markets: {
    lottery: {
      odds1x2: { homeWin: 1.55, draw: 4.2, awayWin: 8 },
      correctScore: {
        "0-0": 13,
        "1-0": 7.5,
        "2-0": 8.5,
        "2-1": 10,
        "1-1": 10.5,
        "0-1": 20,
        other: 3.2,
      },
      totalGoals: {
        "0": 13,
        "1": 5,
        "2": 3.5,
        "3": 4,
        "4": 7,
        "5": 12,
        "6": 20,
        "7+": 30,
      },
    },
    international: {
      odds1x2: { homeWin: 1.7, draw: 3.8, awayWin: 5.5 },
      correctScore: {
        "0-0": 11,
        "1-0": 6.5,
        "2-0": 8,
        "2-1": 9,
        "1-1": 7.5,
        "0-1": 12,
        other: 3,
      },
      totalGoals: {
        "0": 11,
        "1": 4.5,
        "2": 3.2,
        "3": 3.8,
        "4": 6.5,
        "5": 11,
        "6": 18,
        "7+": 28,
      },
      overUnder: { line: 2.5, over: 2.05, under: 1.8 },
      halfTime1x2: { homeWin: 2.25, draw: 2.1, awayWin: 5.5 },
    },
  },
  context: {
    motivation: {
      homeAcceptDraw: true,
      awayNeedWin: true,
    },
  },
  simulation: {
    simulations: 20_000,
    seed: 20260625,
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

test("joint calibration uses score and total-goals markets", () => {
  const normalized = normalizeMarket(
    advancedInput.markets.international,
  );
  const joint = calibrateMarkets(normalized);
  const oneX2 = fitLambdas(normalized.odds1x2);

  assert.notEqual(
    joint.lambdaHome + joint.lambdaAway,
    oneX2.lambdaHome + oneX2.lambdaAway,
  );
  assert.ok(joint.lossComponents.correctScore !== null);
  assert.ok(joint.lossComponents.totalGoals !== null);
  assert.ok(joint.lossComponents.overUnder !== null);
  assert.ok(joint.tempo >= 0.75 && joint.tempo <= 1.4);
});

test("produces quarter distributions and normalized quarter weights", () => {
  const result = simulate(advancedInput);
  const homeWeight = result.derivedParams.homeQuarterWeights.reduce(
    (sum, weight) => sum + weight,
    0,
  );
  const homeLambda = result.derivedParams.homeQuarterLambda.reduce(
    (sum, lambda) => sum + lambda,
    0,
  );

  assert.ok(Math.abs(homeWeight - 1) < 1e-12);
  assert.ok(
    Math.abs(homeLambda - result.derivedParams.lambdaHome) < 1e-12,
  );
  assert.ok(result.quarterGoalDistribution.Q4.anyGoalProb > 0);
  assert.ok(result.simulationSummary.halfTime.drawProb > 0);
});

test("applies the Q4 draw lock when both teams accept a draw", () => {
  const accepting = structuredClone(advancedInput);
  accepting.engine = { phaseShapeOverride: "balanced" };
  accepting.context.motivation = {
    homeAcceptDraw: true,
    awayAcceptDraw: true,
  };
  const neutral = structuredClone(accepting);
  neutral.context.motivation = {};

  const acceptingResult = simulate(accepting);
  const neutralResult = simulate(neutral);

  assert.ok(
    acceptingResult.quarterGoalDistribution.Q4.expectedTotalGoals <
      neutralResult.quarterGoalDistribution.Q4.expectedTotalGoals,
  );
});

test("reports upset paths and positive lottery mispricing candidates", () => {
  const result = simulate(advancedInput);

  assert.ok(result.pathAnalysis.upsetPaths.length > 0);
  assert.ok(
    result.pathAnalysis.upsetPaths.some(
      (path) => path.pathType === "underdog_early_lead",
    ),
  );
  assert.ok(result.mispricingAnalysis.candidates.length > 0);
  assert.ok(
    result.mispricingAnalysis.candidates.every(
      (candidate) => candidate.probabilityGap > 0,
    ),
  );
});

test("applies attack, defense, and finishing multipliers to market lambdas", () => {
  const result = applyTeamCondition({
    marketLambdaHome: 1.5,
    marketLambdaAway: 1,
    condition: {
      homeAttackMultiplier: 1.1,
      awayAttackMultiplier: 0.9,
      homeDefenseMultiplier: 1.2,
      awayDefenseMultiplier: 0.8,
      homeFinishingMultiplier: 1.05,
      awayFinishingMultiplier: 0.95,
    },
  });

  assert.ok(Math.abs(result.lambdaHome - 2.165625) < 1e-12);
  assert.ok(Math.abs(result.lambdaAway - 0.7125) < 1e-12);
});

test("team conditions change expected goals in the intended direction", () => {
  const baseline = structuredClone(advancedInput);
  baseline.engine = { phaseShapeOverride: "balanced" };
  const conditioned = structuredClone(baseline);
  conditioned.context.teamCondition = {
    homeAttackMultiplier: 1.15,
    homeFinishingMultiplier: 1.1,
    awayDefenseMultiplier: 0.9,
    awayAttackMultiplier: 0.9,
    awayFinishingMultiplier: 0.95,
    homeDefenseMultiplier: 1.1,
  };

  const baselineResult = simulate(baseline);
  const conditionedResult = simulate(conditioned);

  assert.ok(
    conditionedResult.derivedParams.lambdaHome >
      baselineResult.derivedParams.lambdaHome,
  );
  assert.ok(
    conditionedResult.derivedParams.lambdaAway <
      baselineResult.derivedParams.lambdaAway,
  );
  assert.ok(
    conditionedResult.simulationSummary.fullTime.expectedHomeGoals >
      baselineResult.simulationSummary.fullTime.expectedHomeGoals,
  );
  assert.ok(
    conditionedResult.simulationSummary.fullTime.expectedAwayGoals <
      baselineResult.simulationSummary.fullTime.expectedAwayGoals,
  );
  assert.equal(
    conditionedResult.derivedParams.marketLambdaHome,
    baselineResult.derivedParams.marketLambdaHome,
  );
  assert.match(
    conditionedResult.diagnostics.warnings.join(" "),
    /球队状态系数已应用/,
  );
});

test("rejects non-positive team condition multipliers", () => {
  const invalid = structuredClone(advancedInput);
  invalid.context.teamCondition = {
    homeAttackMultiplier: 0,
  };

  assert.throws(() => simulate(invalid), /homeAttackMultiplier.*greater than 0/);
});
