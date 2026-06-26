import assert from "node:assert/strict";
import test from "node:test";
import {
  calibrateMarkets,
  fitLambdas,
  normalizeMarket,
  normalizeOdds1x2,
  qualificationMultipliers,
  resolveQualificationContext,
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
    qualificationContext: {
      homeTarget: "draw_or_better",
      awayTarget: "win",
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

test("raises draw probability when both teams target draw-or-better", () => {
  const accepting = structuredClone(advancedInput);
  accepting.engine = { phaseShapeOverride: "balanced" };
  accepting.context.qualificationContext = {
    homeTarget: "draw_or_better",
    awayTarget: "draw_or_better",
  };
  const neutral = structuredClone(accepting);
  neutral.context.qualificationContext = {
    homeTarget: "none",
    awayTarget: "none",
  };

  const acceptingResult = simulate(accepting);
  const neutralResult = simulate(neutral);

  assert.ok(
    acceptingResult.simulationSummary.fullTime.drawProb >
      neutralResult.simulationSummary.fullTime.drawProb,
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

test("raises Q4 risk when a team still needs to win", () => {
  const result = qualificationMultipliers({
    side: "home",
    quarterIndex: 3,
    homeGoals: 1,
    awayGoals: 1,
    context: {
      homeTarget: "win",
      awayTarget: "none",
      homeRequiredGoalDifference: null,
      awayRequiredGoalDifference: null,
    },
    profile: {
      attackResponse: 0.3,
      defensiveExposure: 0.16,
      counterExposure: 0.1,
      targetProtection: 0.15,
    },
  });

  assert.ok(Math.abs(result.ownAttack - 1.225) < 1e-12);
  assert.ok(result.opponentAttack > 1.2);
  assert.equal(result.urgency, 0.75);
  assert.equal(result.targetAchieved, false);
});

test("does not adjust the market baseline before the first match event", () => {
  const result = qualificationMultipliers({
    side: "home",
    quarterIndex: 0,
    homeGoals: 0,
    awayGoals: 0,
    context: {
      homeTarget: "win",
      awayTarget: "draw_or_better",
      homeRequiredGoalDifference: null,
      awayRequiredGoalDifference: null,
    },
    profile: {
      attackResponse: 0.3,
      defensiveExposure: 0.16,
      counterExposure: 0.1,
      targetProtection: 0.15,
    },
  });

  assert.equal(result.ownAttack, 1);
  assert.equal(result.opponentAttack, 1);
});

test("protects a result that already satisfies draw-or-better", () => {
  const result = qualificationMultipliers({
    side: "away",
    quarterIndex: 3,
    homeGoals: 1,
    awayGoals: 1,
    context: {
      homeTarget: "none",
      awayTarget: "draw_or_better",
      homeRequiredGoalDifference: null,
      awayRequiredGoalDifference: null,
    },
    profile: {
      attackResponse: 0.3,
      defensiveExposure: 0.16,
      counterExposure: 0.1,
      targetProtection: 0.15,
    },
  });

  assert.equal(result.ownAttack, 0.85);
  assert.equal(result.opponentAttack, 0.925);
  assert.equal(result.targetAchieved, true);
});

test("keeps market lambdas unchanged by qualification context", () => {
  const neutral = structuredClone(advancedInput);
  neutral.context.qualificationContext = {
    homeTarget: "none",
    awayTarget: "none",
  };
  const targeted = structuredClone(neutral);
  targeted.context.qualificationContext = {
    homeTarget: "goal_difference",
    homeRequiredGoalDifference: 2,
    awayTarget: "draw_or_better",
  };

  const neutralResult = simulate(neutral);
  const targetedResult = simulate(targeted);

  assert.equal(
    targetedResult.derivedParams.lambdaHome,
    neutralResult.derivedParams.lambdaHome,
  );
  assert.equal(
    targetedResult.derivedParams.lambdaAway,
    neutralResult.derivedParams.lambdaAway,
  );
  assert.deepEqual(targetedResult.derivedParams.qualificationContext, {
    homeTarget: "goal_difference",
    awayTarget: "draw_or_better",
    homeRequiredGoalDifference: 2,
    awayRequiredGoalDifference: null,
  });
});

test("goal-difference urgency persists until the required margin is reached", () => {
  const context = {
    homeTarget: "goal_difference",
    awayTarget: "none",
    homeRequiredGoalDifference: 2,
    awayRequiredGoalDifference: null,
  };
  const profile = {
    attackResponse: 0.3,
    defensiveExposure: 0.16,
    counterExposure: 0.1,
    targetProtection: 0.15,
  };
  const short = qualificationMultipliers({
    side: "home",
    quarterIndex: 3,
    homeGoals: 1,
    awayGoals: 0,
    context,
    profile,
  });
  const achieved = qualificationMultipliers({
    side: "home",
    quarterIndex: 3,
    homeGoals: 2,
    awayGoals: 0,
    context,
    profile,
  });

  assert.equal(short.urgency, 0.5);
  assert.equal(short.ownAttack, 1.15);
  assert.equal(achieved.targetAchieved, true);
  assert.equal(achieved.ownAttack, 0.85);
});

test("rejects goal-difference targets without a positive required margin", () => {
  const invalid = structuredClone(advancedInput);
  invalid.context.qualificationContext = {
    homeTarget: "goal_difference",
  };

  assert.throws(
    () => simulate(invalid),
    /homeRequiredGoalDifference.*positive integer/,
  );
});

test("maps legacy motivation to qualification targets with a warning", () => {
  const legacy = structuredClone(advancedInput);
  delete legacy.context.qualificationContext;
  legacy.context.motivation = {
    homeNeedWin: true,
    awayAcceptDraw: true,
  };

  const resolved = resolveQualificationContext({
    qualificationContext: undefined,
    legacyMotivation: legacy.context.motivation,
  });
  const result = simulate(legacy);

  assert.equal(resolved.context.homeTarget, "win");
  assert.equal(resolved.context.awayTarget, "draw_or_better");
  assert.match(result.diagnostics.warnings.join(" "), /兼容映射/);
});
