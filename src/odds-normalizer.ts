import type {
  MarketOddsInput,
  NormalizedMarket,
  Odds1x2,
  Probabilities1x2,
} from "./types.js";

function validateOdds(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 1) {
    throw new Error(`${name} must be a finite number greater than 1`);
  }
}

export function normalizeOdds1x2(odds: Odds1x2): Probabilities1x2 {
  const entries = [
    ["homeWin", odds.homeWin],
    ["draw", odds.draw],
    ["awayWin", odds.awayWin],
  ] as const;

  for (const [name, value] of entries) {
    validateOdds(`markets odds1x2.${name}`, value);
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

export function normalizeOddsMap(
  odds: Record<string, number> | undefined,
  marketName: string,
): Record<string, number> | null {
  if (odds === undefined) return null;

  const entries = Object.entries(odds);
  if (entries.length < 2) {
    throw new Error(`${marketName} must contain at least two selections`);
  }

  const raw = entries.map(([selection, value]) => {
    validateOdds(`${marketName}.${selection}`, value);
    return [selection, 1 / value] as const;
  });
  const total = raw.reduce((sum, [, probability]) => sum + probability, 0);

  return Object.fromEntries(
    raw.map(([selection, probability]) => [
      selection,
      probability / total,
    ]),
  );
}

export function normalizeMarket(market: MarketOddsInput): NormalizedMarket {
  let overUnder: NormalizedMarket["overUnder"] = null;
  if (market.overUnder !== undefined) {
    if (!Number.isFinite(market.overUnder.line) || market.overUnder.line <= 0) {
      throw new Error("markets overUnder.line must be greater than 0");
    }
    validateOdds("markets overUnder.over", market.overUnder.over);
    validateOdds("markets overUnder.under", market.overUnder.under);
    const rawOver = 1 / market.overUnder.over;
    const rawUnder = 1 / market.overUnder.under;
    overUnder = {
      line: market.overUnder.line,
      over: rawOver / (rawOver + rawUnder),
      under: rawUnder / (rawOver + rawUnder),
    };
  }

  return {
    odds1x2: normalizeOdds1x2(market.odds1x2),
    correctScore: normalizeOddsMap(
      market.correctScore,
      "markets correctScore",
    ),
    totalGoals: normalizeOddsMap(market.totalGoals, "markets totalGoals"),
    overUnder,
    halfTime1x2:
      market.halfTime1x2 === undefined
        ? null
        : normalizeOdds1x2(market.halfTime1x2),
  };
}

