import type {
  FavoriteSide,
  PathAnalysis,
  Quarter,
  UpsetPath,
} from "./types.js";
import type { SimulatedMatch } from "./quarter-engine.js";

type PathStats = {
  count: number;
  scores: Map<string, number>;
};

export type PathAccumulator = {
  simulations: number;
  noGoal: number;
  homeFirstGoal: number;
  awayFirstGoal: number;
  firstGoalByQuarter: Record<Quarter, number>;
  homeComebackWin: number;
  awayComebackWin: number;
  favoriteComeback: number;
  underdogHoldLead: number;
  paths: Map<string, PathStats>;
};

const PATH_DESCRIPTIONS: Record<string, string> = {
  underdog_early_lead: "弱队在 Q1/Q2 取得领先，并将不败结果保持到终场。",
  favorite_fail_to_break_block:
    "前三节保持 0-0，强队未能在末节完成预期突破。",
  late_counter_upset: "弱队在 Q4 进球，并由落后或平局状态取得不败结果。",
  draw_lock: "双方接受平局，前三节战平后最终继续保持平局。",
  high_chaos_upset: "比赛进入四球以上的开放局，弱队仍取得不败结果。",
};

export function createPathAccumulator(): PathAccumulator {
  return {
    simulations: 0,
    noGoal: 0,
    homeFirstGoal: 0,
    awayFirstGoal: 0,
    firstGoalByQuarter: { Q1: 0, Q2: 0, Q3: 0, Q4: 0 },
    homeComebackWin: 0,
    awayComebackWin: 0,
    favoriteComeback: 0,
    underdogHoldLead: 0,
    paths: new Map(),
  };
}

export function addMatchToPathAccumulator(
  accumulator: PathAccumulator,
  match: SimulatedMatch,
): void {
  accumulator.simulations += 1;
  if (match.firstGoal === null) {
    accumulator.noGoal += 1;
  } else {
    if (match.firstGoal.side === "home") accumulator.homeFirstGoal += 1;
    else accumulator.awayFirstGoal += 1;
    accumulator.firstGoalByQuarter[match.firstGoal.quarter] += 1;
  }
  if (match.homeComebackWin) accumulator.homeComebackWin += 1;
  if (match.awayComebackWin) accumulator.awayComebackWin += 1;
  if (match.favoriteComeback) accumulator.favoriteComeback += 1;
  if (match.underdogHoldLead) accumulator.underdogHoldLead += 1;

  const score = `${match.homeGoals}-${match.awayGoals}`;
  for (const pathType of match.paths) {
    const stats = accumulator.paths.get(pathType) ?? {
      count: 0,
      scores: new Map<string, number>(),
    };
    stats.count += 1;
    stats.scores.set(score, (stats.scores.get(score) ?? 0) + 1);
    accumulator.paths.set(pathType, stats);
  }
}

export function finalizePathAnalysis(
  accumulator: PathAccumulator,
  favorite: FavoriteSide,
): PathAnalysis {
  const simulations = accumulator.simulations;
  const upsetPaths: UpsetPath[] = [...accumulator.paths.entries()]
    .map(([pathType, stats]) => ({
      pathType,
      probability: stats.count / simulations,
      commonScores: [...stats.scores.entries()]
        .sort(
          (left, right) =>
            right[1] - left[1] || left[0].localeCompare(right[0]),
        )
        .slice(0, 3)
        .map(([score]) => score),
      description:
        PATH_DESCRIPTIONS[pathType] ?? "符合已配置的冷门路径规则。",
    }))
    .sort((left, right) => right.probability - left.probability);

  return {
    firstGoal: {
      noGoalProb: accumulator.noGoal / simulations,
      homeFirstGoalProb: accumulator.homeFirstGoal / simulations,
      awayFirstGoalProb: accumulator.awayFirstGoal / simulations,
      byQuarter: {
        Q1: accumulator.firstGoalByQuarter.Q1 / simulations,
        Q2: accumulator.firstGoalByQuarter.Q2 / simulations,
        Q3: accumulator.firstGoalByQuarter.Q3 / simulations,
        Q4: accumulator.firstGoalByQuarter.Q4 / simulations,
      },
    },
    comeback: {
      homeComebackWinProb: accumulator.homeComebackWin / simulations,
      awayComebackWinProb: accumulator.awayComebackWin / simulations,
      favoriteComebackProb:
        favorite === "none" ? 0 : accumulator.favoriteComeback / simulations,
      underdogHoldLeadProb:
        favorite === "none" ? 0 : accumulator.underdogHoldLead / simulations,
    },
    upsetPaths,
  };
}

