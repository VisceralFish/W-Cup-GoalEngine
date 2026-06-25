import type {
  ResolvedTeamCondition,
  TeamCondition,
} from "./types.js";

const DEFAULT_TEAM_CONDITION: ResolvedTeamCondition = {
  homeAttackMultiplier: 1,
  awayAttackMultiplier: 1,
  homeDefenseMultiplier: 1,
  awayDefenseMultiplier: 1,
  homeFinishingMultiplier: 1,
  awayFinishingMultiplier: 1,
};

export function resolveTeamCondition(
  input: TeamCondition | undefined,
): ResolvedTeamCondition {
  const condition = { ...DEFAULT_TEAM_CONDITION, ...input };

  for (const [name, value] of Object.entries(condition)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`context teamCondition.${name} must be greater than 0`);
    }
  }

  return condition;
}

export function applyTeamCondition(options: {
  marketLambdaHome: number;
  marketLambdaAway: number;
  condition: ResolvedTeamCondition;
}): { lambdaHome: number; lambdaAway: number } {
  const { condition } = options;

  return {
    lambdaHome:
      (options.marketLambdaHome *
        condition.homeAttackMultiplier *
        condition.homeFinishingMultiplier) /
      condition.awayDefenseMultiplier,
    lambdaAway:
      (options.marketLambdaAway *
        condition.awayAttackMultiplier *
        condition.awayFinishingMultiplier) /
      condition.homeDefenseMultiplier,
  };
}
