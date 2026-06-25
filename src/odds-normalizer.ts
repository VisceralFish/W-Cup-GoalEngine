import type { Odds1x2, Probabilities1x2 } from "./types.js";

export function normalizeOdds1x2(odds: Odds1x2): Probabilities1x2 {
  const entries = [
    ["homeWin", odds.homeWin],
    ["draw", odds.draw],
    ["awayWin", odds.awayWin],
  ] as const;

  for (const [name, value] of entries) {
    if (!Number.isFinite(value) || value <= 1) {
      throw new Error(`markets odds1x2.${name} must be a finite number greater than 1`);
    }
  }

  const rawHome = 1 / odds.homeWin;
  const rawDraw = 1 / odds.draw;
  const rawAway = 1 / odds.awayWin;
  const overround = rawHome + rawDraw + rawAway;

  return {
    homeWin: rawHome / overround,
    draw: rawDraw / overround,
    awayWin: rawAway / overround,
  };
}

