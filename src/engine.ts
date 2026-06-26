import { calibrateMarkets } from "./market-calibrator.js";
import { detectMispricing } from "./mispricing-detector.js";
import { normalizeMarket } from "./odds-normalizer.js";
import {
  addMatchToPathAccumulator,
  createPathAccumulator,
  finalizePathAnalysis,
} from "./path-analyzer.js";
import {
  determineFavorite,
  inferPhaseShape,
  resolveQuarterWeights,
  resolveStateReaction,
} from "./phase-shape.js";
import { simulateQuarterMatch } from "./quarter-engine.js";
import {
  resolveQualificationContext,
  resolveQualificationReactionProfile,
} from "./qualification-reaction.js";
import { createSeededRandom } from "./random.js";
import type {
  NormalizedMarket,
  Quarter,
  QuarterGoalDistribution,
  QuarterGoalEngineInput,
  QuarterGoalEngineOutput,
  ScoreProbability,
} from "./types.js";

const QUARTERS: [Quarter, Quarter, Quarter, Quarter] = [
  "Q1",
  "Q2",
  "Q3",
  "Q4",
];

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
  if (loss <= 0.001) return "high";
  if (loss <= 0.01) return "medium";
  return "low";
}

function marketCompleteness(
  market: NormalizedMarket,
): "low" | "medium" | "high" {
  const count =
    1 +
    Number(market.correctScore !== null) +
    Number(market.totalGoals !== null || market.overUnder !== null) +
    Number(market.halfTime1x2 !== null);
  if (count >= 3) return "high";
  if (count >= 2) return "medium";
  return "low";
}

function oddsConsistency(
  lottery: NormalizedMarket,
  international: NormalizedMarket,
): "low" | "medium" | "high" {
  const distance =
    Math.abs(lottery.odds1x2.homeWin - international.odds1x2.homeWin) +
    Math.abs(lottery.odds1x2.draw - international.odds1x2.draw) +
    Math.abs(lottery.odds1x2.awayWin - international.odds1x2.awayWin);
  if (distance <= 0.08) return "high";
  if (distance <= 0.18) return "medium";
  return "low";
}

function createQuarterCounters(): {
  homeGoal: number[];
  awayGoal: number[];
  anyGoal: number[];
  homeGoals: number[];
  awayGoals: number[];
} {
  return {
    homeGoal: [0, 0, 0, 0],
    awayGoal: [0, 0, 0, 0],
    anyGoal: [0, 0, 0, 0],
    homeGoals: [0, 0, 0, 0],
    awayGoals: [0, 0, 0, 0],
  };
}

function finalizeQuarterDistribution(
  counters: ReturnType<typeof createQuarterCounters>,
  simulations: number,
): QuarterGoalDistribution {
  return Object.fromEntries(
    QUARTERS.map((quarter, index) => {
      const expectedHomeGoals = counters.homeGoals[index]! / simulations;
      const expectedAwayGoals = counters.awayGoals[index]! / simulations;
      const anyGoalProb = counters.anyGoal[index]! / simulations;
      return [
        quarter,
        {
          homeGoalProb: counters.homeGoal[index]! / simulations,
          awayGoalProb: counters.awayGoal[index]! / simulations,
          anyGoalProb,
          noGoalProb: 1 - anyGoalProb,
          expectedHomeGoals,
          expectedAwayGoals,
          expectedTotalGoals: expectedHomeGoals + expectedAwayGoals,
        },
      ];
    }),
  ) as QuarterGoalDistribution;
}

function incrementTotalGoalCount(
  counts: Record<string, number>,
  goals: number,
): void {
  const selection = goals >= 7 ? "7+" : String(goals);
  counts[selection] = (counts[selection] ?? 0) + 1;
}

export function simulate(
  input: QuarterGoalEngineInput,
): QuarterGoalEngineOutput {
  validateInput(input);

  const lottery = normalizeMarket(input.markets.lottery);
  const international = normalizeMarket(input.markets.international);
  const calibration = calibrateMarkets(international);
  const qualification = resolveQualificationContext({
    qualificationContext: input.context?.qualificationContext,
    legacyMotivation: input.context?.motivation,
  });
  const qualificationReactionProfile = resolveQualificationReactionProfile(
    input.engine?.qualificationReaction,
  );
  const quality = fitQuality(calibration.loss);
  const favorite = determineFavorite(international);
  const phaseShape = inferPhaseShape({
    market: international,
    favorite,
    lambdaTotal: calibration.lambdaHome + calibration.lambdaAway,
    ...(input.engine?.phaseShapeOverride === undefined
      ? {}
      : { override: input.engine.phaseShapeOverride }),
  });
  const quarterWeights = resolveQuarterWeights({
    phaseShape,
    ...(input.engine?.quarterWeightsOverride === undefined
      ? {}
      : { override: input.engine.quarterWeightsOverride }),
  });
  const stateReactionProfile = resolveStateReaction(
    input.engine?.stateReaction,
  );
  const homeQuarterLambda = quarterWeights.home.map(
    (weight) => calibration.lambdaHome * weight,
  ) as [number, number, number, number];
  const awayQuarterLambda = quarterWeights.away.map(
    (weight) => calibration.lambdaAway * weight,
  ) as [number, number, number, number];
  const random =
    input.simulation.seed === undefined
      ? Math.random
      : createSeededRandom(input.simulation.seed);

  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let homeGoalsTotal = 0;
  let awayGoalsTotal = 0;
  let halfTimeHomeLeads = 0;
  let halfTimeDraws = 0;
  let halfTimeAwayLeads = 0;
  let halfTimeGoals = 0;
  let under15 = 0;
  let under25 = 0;
  let under35 = 0;
  const scoreCounts = new Map<string, number>();
  const totalGoalCounts: Record<string, number> = {};
  const quarterCounters = createQuarterCounters();
  const pathAccumulator = createPathAccumulator();

  for (let index = 0; index < input.simulation.simulations; index += 1) {
    const match = simulateQuarterMatch({
      homeQuarterLambda,
      awayQuarterLambda,
      favorite,
      qualificationContext: qualification.context,
      qualificationReactionProfile,
      stateReactionProfile,
      random,
    });
    const score = `${match.homeGoals}-${match.awayGoals}`;
    const totalGoals = match.homeGoals + match.awayGoals;

    scoreCounts.set(score, (scoreCounts.get(score) ?? 0) + 1);
    incrementTotalGoalCount(totalGoalCounts, totalGoals);
    homeGoalsTotal += match.homeGoals;
    awayGoalsTotal += match.awayGoals;
    if (match.homeGoals > match.awayGoals) homeWins += 1;
    else if (match.homeGoals < match.awayGoals) awayWins += 1;
    else draws += 1;

    halfTimeGoals += match.halfTimeHomeGoals + match.halfTimeAwayGoals;
    if (match.halfTimeHomeGoals > match.halfTimeAwayGoals) {
      halfTimeHomeLeads += 1;
    } else if (match.halfTimeHomeGoals < match.halfTimeAwayGoals) {
      halfTimeAwayLeads += 1;
    } else {
      halfTimeDraws += 1;
    }

    if (totalGoals <= 1) under15 += 1;
    if (totalGoals <= 2) under25 += 1;
    if (totalGoals <= 3) under35 += 1;

    match.quarterScores.forEach((quarter, quarterIndex) => {
      if (quarter.homeGoals > 0) quarterCounters.homeGoal[quarterIndex]! += 1;
      if (quarter.awayGoals > 0) quarterCounters.awayGoal[quarterIndex]! += 1;
      if (quarter.homeGoals + quarter.awayGoals > 0) {
        quarterCounters.anyGoal[quarterIndex]! += 1;
      }
      quarterCounters.homeGoals[quarterIndex]! += quarter.homeGoals;
      quarterCounters.awayGoals[quarterIndex]! += quarter.awayGoals;
    });
    addMatchToPathAccumulator(pathAccumulator, match);
  }

  const scoreDistribution: ScoreProbability[] = [...scoreCounts.entries()]
    .map(([score, count]) => {
      const probability = count / input.simulation.simulations;
      const impliedLotteryProbability = lottery.correctScore?.[score] ?? null;
      return {
        score,
        count,
        probability,
        impliedLotteryProbability,
        impliedInternationalProbability:
          international.correctScore?.[score] ?? null,
        gapVsLottery:
          impliedLotteryProbability === null
            ? null
            : probability - impliedLotteryProbability,
      };
    })
    .sort(
      (left, right) =>
        right.probability - left.probability ||
        left.score.localeCompare(right.score),
    );

  const modelScores = Object.fromEntries(
    scoreDistribution.map((entry) => [entry.score, entry.probability]),
  );
  const modelTotalGoals = Object.fromEntries(
    ["0", "1", "2", "3", "4", "5", "6", "7+"].map((selection) => [
      selection,
      (totalGoalCounts[selection] ?? 0) / input.simulation.simulations,
    ]),
  );
  const model1x2 = {
    homeWin: homeWins / input.simulation.simulations,
    draw: draws / input.simulation.simulations,
    awayWin: awayWins / input.simulation.simulations,
  };
  const warnings: string[] = [];
  if (international.correctScore === null) {
    warnings.push("比分赔率缺失，比分分布仅由其他市场校准。");
  }
  if (
    international.totalGoals === null &&
    international.overUnder === null
  ) {
    warnings.push("总进球赔率缺失，比赛节奏主要由 1X2 和比分盘推断。");
  }
  if (international.halfTime1x2 === null) {
    warnings.push("半场赔率缺失，四节形态使用全场市场与上下文推断。");
  }
  if (quality === "low") {
    warnings.push("联合市场拟合误差较高，不输出高置信度错误定价候选。");
  }
  if (qualification.usedLegacyMotivation) {
    warnings.push(
      "context.motivation 已兼容映射；请迁移到 qualificationContext。",
    );
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
      tempo: calibration.tempo,
      phaseShape,
      favorite,
      homeQuarterWeights: quarterWeights.home,
      awayQuarterWeights: quarterWeights.away,
      homeQuarterLambda,
      awayQuarterLambda,
      stateReactionProfile,
      qualificationContext: qualification.context,
      qualificationReactionProfile,
      fitLoss: calibration.loss,
    },
    marketProbabilities: {
      lottery,
      international,
    },
    simulationSummary: {
      simulations: input.simulation.simulations,
      fullTime: {
        homeWinProb: model1x2.homeWin,
        drawProb: model1x2.draw,
        awayWinProb: model1x2.awayWin,
        expectedHomeGoals: homeGoalsTotal / input.simulation.simulations,
        expectedAwayGoals: awayGoalsTotal / input.simulation.simulations,
        expectedTotalGoals:
          (homeGoalsTotal + awayGoalsTotal) / input.simulation.simulations,
      },
      halfTime: {
        homeLeadProb: halfTimeHomeLeads / input.simulation.simulations,
        drawProb: halfTimeDraws / input.simulation.simulations,
        awayLeadProb: halfTimeAwayLeads / input.simulation.simulations,
        expectedGoals: halfTimeGoals / input.simulation.simulations,
      },
      totalGoals: {
        under15: under15 / input.simulation.simulations,
        over15: 1 - under15 / input.simulation.simulations,
        under25: under25 / input.simulation.simulations,
        over25: 1 - under25 / input.simulation.simulations,
        under35: under35 / input.simulation.simulations,
        over35: 1 - under35 / input.simulation.simulations,
      },
    },
    scoreDistribution,
    topScores: scoreDistribution.slice(0, 10),
    quarterGoalDistribution: finalizeQuarterDistribution(
      quarterCounters,
      input.simulation.simulations,
    ),
    pathAnalysis: finalizePathAnalysis(pathAccumulator, favorite),
    mispricingAnalysis: detectMispricing({
      model: {
        odds1x2: model1x2,
        correctScore: modelScores,
        totalGoals: modelTotalGoals,
      },
      lotteryOdds: input.markets.lottery,
      internationalOdds: input.markets.international,
      lottery,
      international,
      fitQuality: quality,
    }),
    diagnostics: {
      fitQuality: quality,
      marketCompleteness: marketCompleteness(international),
      oddsConsistency: oddsConsistency(lottery, international),
      loss: calibration.lossComponents,
      warnings,
    },
  };
}
