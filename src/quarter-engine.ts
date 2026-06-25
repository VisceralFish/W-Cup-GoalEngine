import { samplePoisson } from "./poisson.js";
import type {
  FavoriteSide,
  Motivation,
  Quarter,
  StateReactionProfile,
  TeamSide,
} from "./types.js";

export type QuarterScore = {
  homeGoals: number;
  awayGoals: number;
};

export type SimulatedMatch = {
  homeGoals: number;
  awayGoals: number;
  halfTimeHomeGoals: number;
  halfTimeAwayGoals: number;
  quarterScores: [QuarterScore, QuarterScore, QuarterScore, QuarterScore];
  firstGoal: { side: TeamSide; quarter: Quarter } | null;
  homeComebackWin: boolean;
  awayComebackWin: boolean;
  favoriteComeback: boolean;
  underdogHoldLead: boolean;
  paths: string[];
};

const QUARTERS: [Quarter, Quarter, Quarter, Quarter] = [
  "Q1",
  "Q2",
  "Q3",
  "Q4",
];

function opposite(side: TeamSide): TeamSide {
  return side === "home" ? "away" : "home";
}

function underdogOf(favorite: FavoriteSide): FavoriteSide {
  return favorite === "none" ? "none" : opposite(favorite);
}

function isLeading(
  side: TeamSide,
  homeGoals: number,
  awayGoals: number,
): boolean {
  return side === "home"
    ? homeGoals > awayGoals
    : awayGoals > homeGoals;
}

function isTrailing(
  side: TeamSide,
  homeGoals: number,
  awayGoals: number,
): boolean {
  return side === "home"
    ? homeGoals < awayGoals
    : awayGoals < homeGoals;
}

function applyStateReaction(options: {
  quarterIndex: number;
  homeGoals: number;
  awayGoals: number;
  homeLambda: number;
  awayLambda: number;
  favorite: FavoriteSide;
  motivation: Motivation;
  profile: StateReactionProfile;
}): { homeLambda: number; awayLambda: number } {
  let { homeLambda, awayLambda } = options;
  const {
    quarterIndex,
    homeGoals,
    awayGoals,
    favorite,
    motivation,
    profile,
  } = options;
  const underdog = underdogOf(favorite);

  if (homeGoals > awayGoals) homeLambda *= profile.leaderSlowdown;
  if (awayGoals > homeGoals) awayLambda *= profile.leaderSlowdown;

  if (favorite !== "none" && isTrailing(favorite, homeGoals, awayGoals)) {
    if (favorite === "home") {
      homeLambda *= profile.favoriteTrailingBoost;
      awayLambda *= profile.opponentCounterBoost;
    } else {
      awayLambda *= profile.favoriteTrailingBoost;
      homeLambda *= profile.opponentCounterBoost;
    }
  }

  if (underdog !== "none" && isLeading(underdog, homeGoals, awayGoals)) {
    if (underdog === "home") {
      homeLambda *= profile.underdogLeadingDefense;
    } else {
      awayLambda *= profile.underdogLeadingDefense;
    }
  }

  if (quarterIndex === 3 && homeGoals === awayGoals) {
    if (motivation.homeNeedWin) {
      homeLambda *= profile.drawLateRiskBoost;
      awayLambda *= profile.opponentCounterBoost;
    }
    if (motivation.awayNeedWin) {
      awayLambda *= profile.drawLateRiskBoost;
      homeLambda *= profile.opponentCounterBoost;
    }
    if (motivation.homeAcceptDraw && motivation.awayAcceptDraw) {
      homeLambda *= 0.85;
      awayLambda *= 0.85;
    }
  }

  return { homeLambda, awayLambda };
}

export function simulateQuarterMatch(options: {
  homeQuarterLambda: [number, number, number, number];
  awayQuarterLambda: [number, number, number, number];
  favorite: FavoriteSide;
  motivation: Motivation;
  stateReactionProfile: StateReactionProfile;
  random: () => number;
}): SimulatedMatch {
  let homeGoals = 0;
  let awayGoals = 0;
  let halfTimeHomeGoals = 0;
  let halfTimeAwayGoals = 0;
  let homeTrailed = false;
  let awayTrailed = false;
  let underdogLed = false;
  let underdogEarlyLead = false;
  let firstGoal: SimulatedMatch["firstGoal"] = null;
  let scoreAfterQ3: QuarterScore = { homeGoals: 0, awayGoals: 0 };
  const quarterScores: QuarterScore[] = [];
  const underdog = underdogOf(options.favorite);

  for (let index = 0; index < QUARTERS.length; index += 1) {
    const adjusted = applyStateReaction({
      quarterIndex: index,
      homeGoals,
      awayGoals,
      homeLambda: options.homeQuarterLambda[index]!,
      awayLambda: options.awayQuarterLambda[index]!,
      favorite: options.favorite,
      motivation: options.motivation,
      profile: options.stateReactionProfile,
    });
    const quarterHomeGoals = samplePoisson(
      adjusted.homeLambda,
      options.random,
    );
    const quarterAwayGoals = samplePoisson(
      adjusted.awayLambda,
      options.random,
    );
    quarterScores.push({
      homeGoals: quarterHomeGoals,
      awayGoals: quarterAwayGoals,
    });

    if (
      firstGoal === null &&
      (quarterHomeGoals > 0 || quarterAwayGoals > 0)
    ) {
      let side: TeamSide;
      if (quarterHomeGoals === 0) side = "away";
      else if (quarterAwayGoals === 0) side = "home";
      else {
        side =
          options.random() <
          quarterHomeGoals / (quarterHomeGoals + quarterAwayGoals)
            ? "home"
            : "away";
      }
      firstGoal = { side, quarter: QUARTERS[index]! };
    }

    homeGoals += quarterHomeGoals;
    awayGoals += quarterAwayGoals;
    if (homeGoals < awayGoals) homeTrailed = true;
    if (awayGoals < homeGoals) awayTrailed = true;

    if (underdog !== "none" && isLeading(underdog, homeGoals, awayGoals)) {
      underdogLed = true;
      if (index <= 1) underdogEarlyLead = true;
    }

    if (index === 1) {
      halfTimeHomeGoals = homeGoals;
      halfTimeAwayGoals = awayGoals;
    }
    if (index === 2) {
      scoreAfterQ3 = { homeGoals, awayGoals };
    }
  }

  const homeComebackWin = homeTrailed && homeGoals > awayGoals;
  const awayComebackWin = awayTrailed && awayGoals > homeGoals;
  const favoriteComeback =
    options.favorite === "home"
      ? homeComebackWin
      : options.favorite === "away"
        ? awayComebackWin
        : false;
  const underdogHoldLead =
    underdogLed &&
    underdog !== "none" &&
    !isTrailing(underdog, homeGoals, awayGoals);
  const finalUnderdogNonLoss =
    underdog !== "none" && !isTrailing(underdog, homeGoals, awayGoals);
  const q4 = quarterScores[3]!;
  const paths: string[] = [];

  if (underdogEarlyLead && finalUnderdogNonLoss) {
    paths.push("underdog_early_lead");
  }
  if (
    options.favorite !== "none" &&
    scoreAfterQ3.homeGoals === 0 &&
    scoreAfterQ3.awayGoals === 0 &&
    finalUnderdogNonLoss
  ) {
    paths.push("favorite_fail_to_break_block");
  }
  if (
    underdog !== "none" &&
    (underdog === "home" ? q4.homeGoals > 0 : q4.awayGoals > 0) &&
    finalUnderdogNonLoss &&
    !isLeading(underdog, scoreAfterQ3.homeGoals, scoreAfterQ3.awayGoals)
  ) {
    paths.push("late_counter_upset");
  }
  if (
    scoreAfterQ3.homeGoals === scoreAfterQ3.awayGoals &&
    homeGoals === awayGoals &&
    options.motivation.homeAcceptDraw &&
    options.motivation.awayAcceptDraw
  ) {
    paths.push("draw_lock");
  }
  if (
    homeGoals + awayGoals >= 4 &&
    finalUnderdogNonLoss &&
    options.favorite !== "none"
  ) {
    paths.push("high_chaos_upset");
  }

  return {
    homeGoals,
    awayGoals,
    halfTimeHomeGoals,
    halfTimeAwayGoals,
    quarterScores: quarterScores as SimulatedMatch["quarterScores"],
    firstGoal,
    homeComebackWin,
    awayComebackWin,
    favoriteComeback,
    underdogHoldLead,
    paths,
  };
}

