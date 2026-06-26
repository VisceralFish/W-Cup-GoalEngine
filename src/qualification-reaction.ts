import type {
  Motivation,
  QualificationContext,
  QualificationReactionProfile,
  QualificationTarget,
  ResolvedQualificationContext,
  TeamSide,
} from "./types.js";

const TIME_PRESSURE = [0.15, 0.35, 0.65, 1] as const;

export const DEFAULT_QUALIFICATION_REACTION: QualificationReactionProfile = {
  attackResponse: 0.3,
  defensiveExposure: 0.16,
  counterExposure: 0.1,
  targetProtection: 0.15,
};

function legacyTarget(options: {
  needWin: boolean | undefined;
  acceptDraw: boolean | undefined;
}): QualificationTarget {
  if (options.needWin) return "win";
  if (options.acceptDraw) return "draw_or_better";
  return "none";
}

function validateRequiredGoalDifference(
  target: QualificationTarget,
  value: number | undefined,
  name: string,
): number | null {
  if (target !== "goal_difference") return null;
  if (!Number.isInteger(value) || value === undefined || value <= 0) {
    throw new Error(`${name} must be a positive integer for goal_difference`);
  }
  return value;
}

export function resolveQualificationContext(options: {
  qualificationContext: QualificationContext | undefined;
  legacyMotivation: Motivation | undefined;
}): {
  context: ResolvedQualificationContext;
  usedLegacyMotivation: boolean;
} {
  const explicit = options.qualificationContext;
  const legacy = options.legacyMotivation;
  const usedLegacyMotivation = explicit === undefined && legacy !== undefined;
  const homeTarget =
    explicit?.homeTarget ??
    legacyTarget({
      needWin: legacy?.homeNeedWin,
      acceptDraw: legacy?.homeAcceptDraw,
    });
  const awayTarget =
    explicit?.awayTarget ??
    legacyTarget({
      needWin: legacy?.awayNeedWin,
      acceptDraw: legacy?.awayAcceptDraw,
    });

  return {
    context: {
      homeTarget,
      awayTarget,
      homeRequiredGoalDifference: validateRequiredGoalDifference(
        homeTarget,
        explicit?.homeRequiredGoalDifference,
        "context qualificationContext.homeRequiredGoalDifference",
      ),
      awayRequiredGoalDifference: validateRequiredGoalDifference(
        awayTarget,
        explicit?.awayRequiredGoalDifference,
        "context qualificationContext.awayRequiredGoalDifference",
      ),
    },
    usedLegacyMotivation,
  };
}

export function resolveQualificationReactionProfile(
  override: Partial<QualificationReactionProfile> | undefined,
): QualificationReactionProfile {
  const profile = { ...DEFAULT_QUALIFICATION_REACTION, ...override };
  for (const [name, value] of Object.entries(profile)) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(
        `engine qualificationReaction.${name} must be between 0 and 1`,
      );
    }
  }
  return profile;
}

function scoreMargin(
  side: TeamSide,
  homeGoals: number,
  awayGoals: number,
): number {
  return side === "home"
    ? homeGoals - awayGoals
    : awayGoals - homeGoals;
}

function targetState(options: {
  target: QualificationTarget;
  requiredGoalDifference: number | null;
  margin: number;
}): { achieved: boolean; urgency: number } {
  const { target, margin } = options;
  if (target === "none") return { achieved: false, urgency: 0 };
  if (target === "win") {
    if (margin >= 1) return { achieved: true, urgency: 0 };
    return { achieved: false, urgency: margin === 0 ? 0.75 : 1 };
  }
  if (target === "draw_or_better") {
    if (margin >= 0) return { achieved: true, urgency: 0 };
    return { achieved: false, urgency: 1 };
  }

  const required = options.requiredGoalDifference!;
  const gap = required - margin;
  if (gap <= 0) return { achieved: true, urgency: 0 };
  return {
    achieved: false,
    urgency: Math.min(1, gap / required),
  };
}

export function qualificationMultipliers(options: {
  side: TeamSide;
  quarterIndex: number;
  homeGoals: number;
  awayGoals: number;
  context: ResolvedQualificationContext;
  profile: QualificationReactionProfile;
}): {
  ownAttack: number;
  opponentAttack: number;
  urgency: number;
  targetAchieved: boolean;
} {
  const target =
    options.side === "home"
      ? options.context.homeTarget
      : options.context.awayTarget;
  const requiredGoalDifference =
    options.side === "home"
      ? options.context.homeRequiredGoalDifference
      : options.context.awayRequiredGoalDifference;
  const state = targetState({
    target,
    requiredGoalDifference,
    margin: scoreMargin(
      options.side,
      options.homeGoals,
      options.awayGoals,
    ),
  });
  const hasMatchState =
    options.quarterIndex > 0 || options.homeGoals + options.awayGoals > 0;
  const timePressure = hasMatchState
    ? TIME_PRESSURE[options.quarterIndex]!
    : 0;

  if (state.urgency > 0) {
    const risk = state.urgency * timePressure;
    return {
      ownAttack: 1 + risk * options.profile.attackResponse,
      opponentAttack:
        (1 + risk * options.profile.defensiveExposure) *
        (1 + risk * options.profile.counterExposure),
      urgency: state.urgency,
      targetAchieved: false,
    };
  }

  if (state.achieved) {
    const protection = timePressure * options.profile.targetProtection;
    return {
      ownAttack: 1 - protection,
      opponentAttack: 1 - protection * 0.5,
      urgency: 0,
      targetAchieved: true,
    };
  }

  return {
    ownAttack: 1,
    opponentAttack: 1,
    urgency: 0,
    targetAchieved: false,
  };
}
