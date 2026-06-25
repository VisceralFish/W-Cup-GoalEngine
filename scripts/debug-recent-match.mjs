import { readFile } from "node:fs/promises";
import { simulate } from "../dist/index.js";

const fixturePath = new URL(
  "../examples/recent-matches-2026-06-23-24.json",
  import.meta.url,
);
const fixtures = JSON.parse(await readFile(fixturePath, "utf8"));
const fixture = fixtures.find(
  (item) =>
    item.homeTeam === "South Korea" && item.awayTeam === "South Africa",
);

if (!fixture) {
  throw new Error("South Korea vs South Africa fixture not found");
}

const simulations = 50_000;
const input = {
  match: {
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    stage: "group",
    groupRound: 3,
  },
  markets: {
    lottery: {
      odds1x2: fixture.internationalOdds1x2,
    },
    international: {
      odds1x2: fixture.internationalOdds1x2,
    },
  },
  simulation: {
    simulations,
    seed: 20260624,
  },
};

const output = simulate(input);
const actualScore = `${fixture.result.homeGoals}-${fixture.result.awayGoals}`;
const actualScoreModel = output.scoreDistribution.find(
  (item) => item.score === actualScore,
);
const actualOutcomeProbability =
  fixture.result.homeGoals > fixture.result.awayGoals
    ? output.simulationSummary.fullTime.homeWinProb
    : fixture.result.homeGoals < fixture.result.awayGoals
      ? output.simulationSummary.fullTime.awayWinProb
      : output.simulationSummary.fullTime.drawProb;

const debugResult = {
  fixture: {
    date: fixture.date,
    match: `${fixture.homeTeam} vs ${fixture.awayTeam}`,
    actualScore,
    oddsSource: fixture.source.odds,
    resultSource: fixture.source.result,
  },
  note: "No same-time China Sports Lottery snapshot was available. The lottery field duplicates the international odds and is not used for mispricing analysis.",
  input,
  derivedParams: output.derivedParams,
  normalizedMarketProbabilities: output.marketProbabilities.international,
  simulationSummary: output.simulationSummary,
  actualResultCheck: {
    actualOutcomeProbability,
    actualScoreProbability: actualScoreModel?.probability ?? 0,
    actualScoreRank:
      output.scoreDistribution.findIndex((item) => item.score === actualScore) +
      1,
  },
  topScores: output.topScores,
  diagnostics: output.diagnostics,
};

process.stdout.write(`${JSON.stringify(debugResult, null, 2)}\n`);

