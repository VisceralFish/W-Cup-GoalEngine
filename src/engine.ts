import { fitLambdas } from "./market-calibrator.js";
import { normalizeOdds1x2 } from "./odds-normalizer.js";
import { samplePoisson } from "./poisson.js";
import { createSeededRandom } from "./random.js";
import type {
  QuarterGoalEngineInput,
  QuarterGoalEngineOutput,
  ScoreProbability,
} from "./types.js";

function validateInput(input: QuarterGoalEngineInput): void {
  if (!input.match.homeTeam.trim()) {
    throw new Error("match.homeTeam is required");
  }
  if (!input.match.awayTeam.trim()) {
    throw new Error("match.awayTeam is required");
  }
  if (!Number.isInteger(input.simulation.simulations)) {
    throw new Error("simulation.simulations must be an integer");
  }
  if (
    input.simulation.simulations < 1 ||
    input.simulation.simulations > 1_000_000
  ) {
    throw new Error("simulation.simulations must be between 1 and 1000000");
  }
  if (
    input.simulation.seed !== undefined &&
    !Number.isSafeInteger(input.simulation.seed)
  ) {
    throw new Error("simulation.seed must be a safe integer");
  }
}

function fitQuality(loss: number): "low" | "medium" | "high" {
  if (loss <= 0.0005) return "high";
  if (loss <= 0.005) return "medium";
  return "low";
}

export function simulate(
  input: QuarterGoalEngineInput,
): QuarterGoalEngineOutput {
  validateInput(input);

  const lottery = normalizeOdds1x2(input.markets.lottery.odds1x2);
  const international = normalizeOdds1x2(
    input.markets.international.odds1x2,
  );
  const calibration = fitLambdas(international);
  const random =
    input.simulation.seed === undefined
      ? Math.random
      : createSeededRandom(input.simulation.seed);

  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let homeGoalsTotal = 0;
  let awayGoalsTotal = 0;
  const scoreCounts = new Map<string, number>();

  for (let index = 0; index < input.simulation.simulations; index += 1) {
    const homeGoals = samplePoisson(calibration.lambdaHome, random);
    const awayGoals = samplePoisson(calibration.lambdaAway, random);
    const score = `${homeGoals}-${awayGoals}`;

    scoreCounts.set(score, (scoreCounts.get(score) ?? 0) + 1);
    homeGoalsTotal += homeGoals;
    awayGoalsTotal += awayGoals;

    if (homeGoals > awayGoals) homeWins += 1;
    else if (homeGoals < awayGoals) awayWins += 1;
    else draws += 1;
  }

  const scoreDistribution: ScoreProbability[] = [...scoreCounts.entries()]
    .map(([score, count]) => ({
      score,
      count,
      probability: count / input.simulation.simulations,
    }))
    .sort(
      (left, right) =>
        right.probability - left.probability ||
        left.score.localeCompare(right.score),
    );

  const warnings: string[] = [
    "V0.1 only calibrates against international 1X2 odds.",
  ];
  const quality = fitQuality(calibration.loss);
  if (quality === "low") {
    warnings.push("The Poisson fit error is high; treat the output cautiously.");
  }

  return {
    match: {
      homeTeam: input.match.homeTeam,
      awayTeam: input.match.awayTeam,
    },
    derivedParams: {
      lambdaHome: calibration.lambdaHome,
      lambdaAway: calibration.lambdaAway,
      lambdaTotal: calibration.lambdaHome + calibration.lambdaAway,
      fitLoss: calibration.loss,
    },
    marketProbabilities: {
      lottery,
      international,
    },
    simulationSummary: {
      simulations: input.simulation.simulations,
      fullTime: {
        homeWinProb: homeWins / input.simulation.simulations,
        drawProb: draws / input.simulation.simulations,
        awayWinProb: awayWins / input.simulation.simulations,
        expectedHomeGoals: homeGoalsTotal / input.simulation.simulations,
        expectedAwayGoals: awayGoalsTotal / input.simulation.simulations,
        expectedTotalGoals:
          (homeGoalsTotal + awayGoalsTotal) / input.simulation.simulations,
      },
    },
    scoreDistribution,
    topScores: scoreDistribution.slice(0, 10),
    diagnostics: {
      fitQuality: quality,
      warnings,
    },
  };
}

