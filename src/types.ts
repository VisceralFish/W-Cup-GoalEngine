export type Odds1x2 = {
  homeWin: number;
  draw: number;
  awayWin: number;
};

export type Probabilities1x2 = {
  homeWin: number;
  draw: number;
  awayWin: number;
};

export type QuarterGoalEngineInput = {
  match: {
    homeTeam: string;
    awayTeam: string;
    stage: "group" | "knockout";
    groupRound?: 1 | 2 | 3;
  };
  markets: {
    lottery: {
      odds1x2: Odds1x2;
    };
    international: {
      odds1x2: Odds1x2;
    };
  };
  simulation: {
    simulations: number;
    seed?: number;
  };
};

export type ScoreProbability = {
  score: string;
  probability: number;
  count: number;
};

export type QuarterGoalEngineOutput = {
  match: {
    homeTeam: string;
    awayTeam: string;
  };
  derivedParams: {
    lambdaHome: number;
    lambdaAway: number;
    lambdaTotal: number;
    fitLoss: number;
  };
  marketProbabilities: {
    lottery: Probabilities1x2;
    international: Probabilities1x2;
  };
  simulationSummary: {
    simulations: number;
    fullTime: {
      homeWinProb: number;
      drawProb: number;
      awayWinProb: number;
      expectedHomeGoals: number;
      expectedAwayGoals: number;
      expectedTotalGoals: number;
    };
  };
  scoreDistribution: ScoreProbability[];
  topScores: ScoreProbability[];
  diagnostics: {
    fitQuality: "low" | "medium" | "high";
    warnings: string[];
  };
};

