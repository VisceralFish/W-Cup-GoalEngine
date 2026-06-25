import {
  poisson1x2Probabilities,
  poissonProbability,
} from "./poisson.js";
import type { NormalizedMarket, Probabilities1x2 } from "./types.js";

export type CalibrationLoss = {
  total: number;
  odds1x2: number;
  correctScore: number | null;
  totalGoals: number | null;
  overUnder: number | null;
};

export type CalibrationResult = {
  lambdaHome: number;
  lambdaAway: number;
  tempo: number;
  loss: number;
  lossComponents: CalibrationLoss;
};

function meanSquaredError(
  actual: Record<string, number>,
  target: Record<string, number>,
): number {
  const selections = Object.keys(target);
  return (
    selections.reduce(
      (sum, selection) =>
        sum + ((actual[selection] ?? 0) - target[selection]!) ** 2,
      0,
    ) / selections.length
  );
}

function oneX2Error(
  actual: Probabilities1x2,
  target: Probabilities1x2,
): number {
  return meanSquaredError(actual, target);
}

function normalizeModelSelections(
  probabilities: Record<string, number>,
): Record<string, number> {
  const total = Object.values(probabilities).reduce(
    (sum, probability) => sum + probability,
    0,
  );
  if (total <= 0) return probabilities;

  return Object.fromEntries(
    Object.entries(probabilities).map(([selection, probability]) => [
      selection,
      probability / total,
    ]),
  );
}

function scoreProbability(
  selection: string,
  lambdaHome: number,
  lambdaAway: number,
): number | null {
  const match = /^(\d+)-(\d+)$/.exec(selection);
  if (match === null) return null;
  const homeGoals = Number(match[1]);
  const awayGoals = Number(match[2]);
  return (
    poissonProbability(homeGoals, lambdaHome) *
    poissonProbability(awayGoals, lambdaAway)
  );
}

function modelCorrectScore(
  target: Record<string, number>,
  lambdaHome: number,
  lambdaAway: number,
): Record<string, number> {
  const result: Record<string, number> = {};
  let explicitMass = 0;

  for (const selection of Object.keys(target)) {
    if (selection === "other") continue;
    const probability = scoreProbability(selection, lambdaHome, lambdaAway);
    if (probability === null) {
      throw new Error(`Unsupported correct score selection: ${selection}`);
    }
    result[selection] = probability;
    explicitMass += probability;
  }

  if ("other" in target) {
    result.other = Math.max(0, 1 - explicitMass);
    return result;
  }

  return normalizeModelSelections(result);
}

function totalGoalProbability(selection: string, lambdaTotal: number): number {
  if (selection === "7+") {
    let underSeven = 0;
    for (let goals = 0; goals <= 6; goals += 1) {
      underSeven += poissonProbability(goals, lambdaTotal);
    }
    return Math.max(0, 1 - underSeven);
  }

  const goals = Number(selection);
  if (!Number.isInteger(goals) || goals < 0) {
    throw new Error(`Unsupported total goals selection: ${selection}`);
  }
  return poissonProbability(goals, lambdaTotal);
}

function modelTotalGoals(
  target: Record<string, number>,
  lambdaTotal: number,
): Record<string, number> {
  return normalizeModelSelections(
    Object.fromEntries(
      Object.keys(target).map((selection) => [
        selection,
        totalGoalProbability(selection, lambdaTotal),
      ]),
    ),
  );
}

function modelOverUnder(
  line: number,
  lambdaTotal: number,
): { over: number; under: number } {
  const maximumUnder = Math.ceil(line) - 1;
  let under = 0;
  for (let goals = 0; goals <= maximumUnder; goals += 1) {
    under += poissonProbability(goals, lambdaTotal);
  }

  const over = Math.max(0, 1 - under);
  return { over, under };
}

function calculateLoss(
  lambdaHome: number,
  lambdaAway: number,
  market: NormalizedMarket,
): CalibrationLoss {
  const odds1x2 = oneX2Error(
    poisson1x2Probabilities(lambdaHome, lambdaAway),
    market.odds1x2,
  );
  const correctScore =
    market.correctScore === null
      ? null
      : meanSquaredError(
          modelCorrectScore(market.correctScore, lambdaHome, lambdaAway),
          market.correctScore,
        );
  const totalGoals =
    market.totalGoals === null
      ? null
      : meanSquaredError(
          modelTotalGoals(market.totalGoals, lambdaHome + lambdaAway),
          market.totalGoals,
        );
  const overUnder =
    market.overUnder === null
      ? null
      : meanSquaredError(
          modelOverUnder(market.overUnder.line, lambdaHome + lambdaAway),
          {
            over: market.overUnder.over,
            under: market.overUnder.under,
          },
        );

  const weighted = [
    { value: odds1x2, weight: 0.2 },
    { value: correctScore, weight: 0.4 },
    { value: totalGoals, weight: market.overUnder === null ? 0.25 : 0.125 },
    { value: overUnder, weight: market.totalGoals === null ? 0.25 : 0.125 },
  ].filter(
    (entry): entry is { value: number; weight: number } =>
      entry.value !== null,
  );
  const weightTotal = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  const total =
    weighted.reduce(
      (sum, entry) => sum + entry.value * entry.weight,
      0,
    ) / weightTotal;

  return { total, odds1x2, correctScore, totalGoals, overUnder };
}

function gridSearch(market: NormalizedMarket): Omit<CalibrationResult, "tempo"> {
  let best: Omit<CalibrationResult, "tempo"> = {
    lambdaHome: 1.35,
    lambdaAway: 1.05,
    loss: Number.POSITIVE_INFINITY,
    lossComponents: {
      total: Number.POSITIVE_INFINITY,
      odds1x2: Number.POSITIVE_INFINITY,
      correctScore: null,
      totalGoals: null,
      overUnder: null,
    },
  };

  for (let homeStep = 2; homeStep <= 90; homeStep += 1) {
    const lambdaHome = homeStep * 0.05;

    for (let awayStep = 2; awayStep <= 90; awayStep += 1) {
      const lambdaAway = awayStep * 0.05;
      const lambdaTotal = lambdaHome + lambdaAway;
      if (lambdaTotal < 0.3 || lambdaTotal > 6.5) continue;

      const lossComponents = calculateLoss(
        lambdaHome,
        lambdaAway,
        market,
      );
      if (lossComponents.total < best.loss) {
        best = {
          lambdaHome,
          lambdaAway,
          loss: lossComponents.total,
          lossComponents,
        };
      }
    }
  }

  return best;
}

export function calibrateMarkets(market: NormalizedMarket): CalibrationResult {
  const joint = gridSearch(market);
  const oneX2Only: NormalizedMarket = {
    odds1x2: market.odds1x2,
    correctScore: null,
    totalGoals: null,
    overUnder: null,
    halfTime1x2: null,
  };
  const baseline = gridSearch(oneX2Only);
  const tempo = Math.min(
    1.4,
    Math.max(
      0.75,
      (joint.lambdaHome + joint.lambdaAway) /
        (baseline.lambdaHome + baseline.lambdaAway),
    ),
  );

  return { ...joint, tempo };
}

export function fitLambdas(target: Probabilities1x2): CalibrationResult {
  return calibrateMarkets({
    odds1x2: target,
    correctScore: null,
    totalGoals: null,
    overUnder: null,
    halfTime1x2: null,
  });
}

export function modelTotalGoalSelection(
  selection: string,
  lambdaTotal: number,
): number {
  return totalGoalProbability(selection, lambdaTotal);
}
