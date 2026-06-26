import type {
  FavoriteSide,
  NormalizedMarket,
  PhaseShape,
  StateReactionProfile,
} from "./types.js";

const PHASE_WEIGHTS: Record<
  PhaseShape,
  [number, number, number, number]
> = {
  balanced: [0.23, 0.24, 0.24, 0.29],
  front_loaded: [0.28, 0.25, 0.23, 0.24],
  back_loaded: [0.2, 0.22, 0.26, 0.32],
  low_first_half: [0.19, 0.21, 0.27, 0.33],
  high_first_half: [0.27, 0.27, 0.22, 0.24],
  chaotic: [0.25, 0.25, 0.25, 0.25],
  favorite_late_push: [0.21, 0.22, 0.26, 0.31],
  underdog_survival: [0.18, 0.21, 0.25, 0.36],
};

export const DEFAULT_STATE_REACTION: StateReactionProfile = {
  favoriteTrailingBoost: 1.2,
  underdogLeadingDefense: 0.85,
  leaderSlowdown: 0.92,
  opponentCounterBoost: 1.08,
};

export function determineFavorite(market: NormalizedMarket): FavoriteSide {
  const gap = Math.abs(
    market.odds1x2.homeWin - market.odds1x2.awayWin,
  );
  if (gap < 0.05) return "none";
  return market.odds1x2.homeWin > market.odds1x2.awayWin ? "home" : "away";
}

export function inferPhaseShape(options: {
  market: NormalizedMarket;
  favorite: FavoriteSide;
  lambdaTotal: number;
  override?: PhaseShape;
}): PhaseShape {
  if (options.override !== undefined) return options.override;

  const { market, favorite, lambdaTotal } = options;
  if (market.overUnder !== null && market.overUnder.over >= 0.58) {
    return "chaotic";
  }
  if (
    market.halfTime1x2 !== null &&
    market.halfTime1x2.draw >= 0.48
  ) {
    return favorite === "none" ? "back_loaded" : "favorite_late_push";
  }
  if (
    favorite !== "none" &&
    lambdaTotal <= 2.25 &&
    market.odds1x2.draw >= 0.28
  ) {
    return "underdog_survival";
  }
  if (lambdaTotal >= 3) return "front_loaded";
  return "balanced";
}

function validateWeights(
  weights: [number, number, number, number],
  name: string,
): void {
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new Error(`${name} must contain finite non-negative weights`);
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(total - 1) > 1e-9) {
    throw new Error(`${name} must sum to 1`);
  }
}

export function resolveQuarterWeights(options: {
  phaseShape: PhaseShape;
  override?: {
    home: [number, number, number, number];
    away: [number, number, number, number];
  };
}): {
  home: [number, number, number, number];
  away: [number, number, number, number];
} {
  if (options.override !== undefined) {
    validateWeights(options.override.home, "engine quarterWeightsOverride.home");
    validateWeights(options.override.away, "engine quarterWeightsOverride.away");
    return options.override;
  }

  const weights = PHASE_WEIGHTS[options.phaseShape];
  return {
    home: [...weights],
    away: [...weights],
  };
}

export function resolveStateReaction(
  override: Partial<StateReactionProfile> | undefined,
): StateReactionProfile {
  const profile = { ...DEFAULT_STATE_REACTION, ...override };
  for (const [name, value] of Object.entries(profile)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`engine stateReaction.${name} must be greater than 0`);
    }
  }
  return profile;
}
