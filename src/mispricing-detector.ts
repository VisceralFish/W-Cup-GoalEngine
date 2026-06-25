import type {
  MarketOddsInput,
  MispricingAnalysis,
  MispricingCandidate,
  NormalizedMarket,
} from "./types.js";

type ModelMarkets = {
  odds1x2: Record<string, number>;
  correctScore: Record<string, number>;
  totalGoals: Record<string, number>;
};

function conditionalize(
  model: Record<string, number>,
  selections: string[],
): Record<string, number> {
  const explicitSelections = selections.filter(
    (selection) => selection !== "other",
  );
  const result = Object.fromEntries(
    explicitSelections.map((selection) => [
      selection,
      model[selection] ?? 0,
    ]),
  ) as Record<string, number>;

  if (selections.includes("other")) {
    result.other = Math.max(
      0,
      1 -
        explicitSelections.reduce(
          (sum, selection) => sum + (model[selection] ?? 0),
          0,
        ),
    );
    return result;
  }

  const total = Object.values(result).reduce(
    (sum, probability) => sum + probability,
    0,
  );
  if (total <= 0) return result;
  return Object.fromEntries(
    Object.entries(result).map(([selection, probability]) => [
      selection,
      probability / total,
    ]),
  );
}

function confidenceFor(options: {
  marketCount: number;
  fitQuality: "low" | "medium" | "high";
  modelProbability: number;
  internationalProbability: number | null;
}): "low" | "medium" | "high" {
  if (
    options.marketCount >= 3 &&
    options.fitQuality === "high" &&
    options.internationalProbability !== null &&
    Math.abs(
      options.modelProbability - options.internationalProbability,
    ) <= 0.03
  ) {
    return "high";
  }
  if (options.marketCount >= 2 && options.fitQuality !== "low") {
    return "medium";
  }
  return "low";
}

function buildCandidate(options: {
  marketType: MispricingCandidate["marketType"];
  selection: string;
  modelProbability: number;
  lotteryProbability: number;
  internationalProbability: number | null;
  lotteryOdds: number;
  marketCount: number;
  fitQuality: "low" | "medium" | "high";
}): MispricingCandidate | null {
  const probabilityGap =
    options.modelProbability - options.lotteryProbability;
  if (probabilityGap <= 0.01 || options.modelProbability <= 0) return null;

  const fairOdds = 1 / options.modelProbability;
  if (options.lotteryOdds <= fairOdds) return null;
  const confidence = confidenceFor({
    marketCount: options.marketCount,
    fitQuality: options.fitQuality,
    modelProbability: options.modelProbability,
    internationalProbability: options.internationalProbability,
  });

  return {
    marketType: options.marketType,
    selection: options.selection,
    modelProbability: options.modelProbability,
    lotteryImpliedProbability: options.lotteryProbability,
    internationalImpliedProbability: options.internationalProbability,
    probabilityGap,
    fairOdds,
    lotteryOdds: options.lotteryOdds,
    edgeScore:
      probabilityGap / Math.max(options.lotteryProbability, 0.01),
    confidence,
    reason:
      options.internationalProbability === null
        ? "模型概率高于体彩去水后的隐含概率，但缺少同类外盘选项支持。"
        : "模型概率高于体彩隐含概率，并参考同类外盘概率评估一致性。",
  };
}

export function detectMispricing(options: {
  model: ModelMarkets;
  lotteryOdds: MarketOddsInput;
  internationalOdds: MarketOddsInput;
  lottery: NormalizedMarket;
  international: NormalizedMarket;
  fitQuality: "low" | "medium" | "high";
}): MispricingAnalysis {
  const marketCount =
    1 +
    Number(options.international.correctScore !== null) +
    Number(
      options.international.totalGoals !== null ||
        options.international.overUnder !== null,
    ) +
    Number(options.international.halfTime1x2 !== null);
  const candidates: MispricingCandidate[] = [];

  const oneX2Selections = ["homeWin", "draw", "awayWin"] as const;
  for (const selection of oneX2Selections) {
    const candidate = buildCandidate({
      marketType: "1x2",
      selection,
      modelProbability: options.model.odds1x2[selection]!,
      lotteryProbability: options.lottery.odds1x2[selection],
      internationalProbability: options.international.odds1x2[selection],
      lotteryOdds: options.lotteryOdds.odds1x2[selection],
      marketCount,
      fitQuality: options.fitQuality,
    });
    if (candidate !== null) candidates.push(candidate);
  }

  if (
    options.lottery.correctScore !== null &&
    options.lotteryOdds.correctScore !== undefined
  ) {
    const selections = Object.keys(options.lottery.correctScore);
    const model = conditionalize(options.model.correctScore, selections);
    for (const selection of selections) {
      const candidate = buildCandidate({
        marketType: "correct_score",
        selection,
        modelProbability: model[selection]!,
        lotteryProbability: options.lottery.correctScore[selection]!,
        internationalProbability:
          options.international.correctScore?.[selection] ?? null,
        lotteryOdds: options.lotteryOdds.correctScore[selection]!,
        marketCount,
        fitQuality: options.fitQuality,
      });
      if (candidate !== null) candidates.push(candidate);
    }
  }

  if (
    options.lottery.totalGoals !== null &&
    options.lotteryOdds.totalGoals !== undefined
  ) {
    const selections = Object.keys(options.lottery.totalGoals);
    const model = conditionalize(options.model.totalGoals, selections);
    for (const selection of selections) {
      const candidate = buildCandidate({
        marketType: "total_goals",
        selection,
        modelProbability: model[selection]!,
        lotteryProbability: options.lottery.totalGoals[selection]!,
        internationalProbability:
          options.international.totalGoals?.[selection] ?? null,
        lotteryOdds: options.lotteryOdds.totalGoals[selection]!,
        marketCount,
        fitQuality: options.fitQuality,
      });
      if (candidate !== null) candidates.push(candidate);
    }
  }

  return {
    targetMarket: "lottery",
    referenceMarket: "international",
    candidates: candidates.sort(
      (left, right) => right.edgeScore - left.edgeScore,
    ),
  };
}

