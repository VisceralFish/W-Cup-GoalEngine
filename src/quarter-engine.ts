import { qualificationMultipliers } from "./qualification-reaction.js";
import type {
  FavoriteSide,
  QualificationReactionProfile,
  Quarter,
  ResolvedQualificationContext,
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
  qualificationContext: ResolvedQualificationContext;
  qualificationReactionProfile: QualificationReactionProfile;
  profile: StateReactionProfile;
}): { homeLambda: number; awayLambda: number } {
  let { homeLambda, awayLambda } = options;
  const {
    quarterIndex,
    homeGoals,
    awayGoals,
    favorite,
    qualificationContext,
    qualificationReactionProfile,
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

  const homeQualification = qualificationMultipliers({
    side: "home",
    quarterIndex,
    homeGoals,
    awayGoals,
    context: qualificationContext,
    profile: qualificationReactionProfile,
  });
  const awayQualification = qualificationMultipliers({
    side: "away",
    quarterIndex,
    homeGoals,
    awayGoals,
    context: qualificationContext,
    profile: qualificationReactionProfile,
  });
  homeLambda *=
    homeQualification.ownAttack * awayQualification.opponentAttack;
  awayLambda *=
    awayQualification.ownAttack * homeQualification.opponentAttack;

  return { homeLambda, awayLambda };
}

export function simulateQuarterMatch(options: {
  homeQuarterLambda: [number, number, number, number];
  awayQuarterLambda: [number, number, number, number];
  favorite: FavoriteSide;
  qualificationContext: ResolvedQualificationContext;
  qualificationReactionProfile: QualificationReactionProfile;
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
    let quarterHomeGoals = 0;
    let quarterAwayGoals = 0;
    let remainingQuarter = 1;

    while (remainingQuarter > 0) {
      const adjusted = applyStateReaction({
        quarterIndex: index,
        homeGoals,
        awayGoals,
        homeLambda: options.homeQuarterLambda[index]!,
        awayLambda: options.awayQuarterLambda[index]!,
        favorite: options.favorite,
        qualificationContext: options.qualificationContext,
        qualificationReactionProfile: options.qualificationReactionProfile,
        profile: options.stateReactionProfile,
      });
      const totalLambda = adjusted.homeLambda + adjusted.awayLambda;
      if (totalLambda <= 0) break;

      const waitingTime =
        -Math.log(Math.max(options.random(), Number.MIN_VALUE)) / totalLambda;
      if (waitingTime > remainingQuarter) break;
      remainingQuarter -= waitingTime;

      const scoringSide: TeamSide =
        options.random() < adjusted.homeLambda / totalLambda
          ? "home"
          : "away";
      if (firstGoal === null) {
        firstGoal = { side: scoringSide, quarter: QUARTERS[index]! };
      }
      if (scoringSide === "home") {
        quarterHomeGoals += 1;
        homeGoals += 1;
      } else {
        quarterAwayGoals += 1;
        awayGoals += 1;
      }
      if (homeGoals < awayGoals) homeTrailed = true;
      if (awayGoals < homeGoals) awayTrailed = true;
      if (underdog !== "none" && isLeading(underdog, homeGoals, awayGoals)) {
        underdogLed = true;
        if (index <= 1) underdogEarlyLead = true;
      }
    }

    quarterScores.push({
      homeGoals: quarterHomeGoals,
      awayGoals: quarterAwayGoals,
    });

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
    options.qualificationContext.homeTarget === "draw_or_better" &&
    options.qualificationContext.awayTarget === "draw_or_better"
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
