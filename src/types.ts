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

export type CorrectScoreOdds = Record<string, number>;
export type TotalGoalsOdds = Record<string, number>;

export type OverUnderOdds = {
  line: number;
  over: number;
  under: number;
};

export type HalfTime1x2Odds = Odds1x2;

export type PhaseShape =
  | "balanced"
  | "front_loaded"
  | "back_loaded"
  | "low_first_half"
  | "high_first_half"
  | "chaotic"
  | "favorite_late_push"
  | "underdog_survival";

export type Quarter = "Q1" | "Q2" | "Q3" | "Q4";
export type TeamSide = "home" | "away";
export type FavoriteSide = TeamSide | "none";

export type MarketOddsInput = {
  odds1x2: Odds1x2;
  correctScore?: CorrectScoreOdds;
  totalGoals?: TotalGoalsOdds;
  overUnder?: OverUnderOdds;
  halfTime1x2?: HalfTime1x2Odds;
};

export type Motivation = {
  homeNeedWin?: boolean;
  awayNeedWin?: boolean;
  homeAcceptDraw?: boolean;
  awayAcceptDraw?: boolean;
};

export type QualificationTarget =
  | "win"
  | "draw_or_better"
  | "goal_difference"
  | "none";

export type QualificationContext = {
  homeTarget?: QualificationTarget;
  awayTarget?: QualificationTarget;
  homeRequiredGoalDifference?: number;
  awayRequiredGoalDifference?: number;
};

export type ResolvedQualificationContext = {
  homeTarget: QualificationTarget;
  awayTarget: QualificationTarget;
  homeRequiredGoalDifference: number | null;
  awayRequiredGoalDifference: number | null;
};

export type QualificationReactionProfile = {
  attackResponse: number;
  defensiveExposure: number;
  counterExposure: number;
  targetProtection: number;
};

export type StateReactionProfile = {
  favoriteTrailingBoost: number;
  underdogLeadingDefense: number;
  leaderSlowdown: number;
  opponentCounterBoost: number;
};

export type QuarterGoalEngineInput = {
  match: {
    homeTeam: string;
    awayTeam: string;
    stage: "group" | "knockout";
    groupRound?: 1 | 2 | 3;
  };
  markets: {
    lottery: MarketOddsInput;
    international: MarketOddsInput;
  };
  context?: {
    qualificationContext?: QualificationContext;
    /** @deprecated Use qualificationContext. */
    motivation?: Motivation;
  };
  engine?: {
    phaseShapeOverride?: PhaseShape;
    quarterWeightsOverride?: {
      home: [number, number, number, number];
      away: [number, number, number, number];
    };
    stateReaction?: Partial<StateReactionProfile>;
    qualificationReaction?: Partial<QualificationReactionProfile>;
  };
  simulation: {
    simulations: number;
    seed?: number;
  };
};

export type NormalizedMarket = {
  odds1x2: Probabilities1x2;
  correctScore: Record<string, number> | null;
  totalGoals: Record<string, number> | null;
  overUnder: { line: number; over: number; under: number } | null;
  halfTime1x2: Probabilities1x2 | null;
};

export type ScoreProbability = {
  score: string;
  probability: number;
  count: number;
  impliedLotteryProbability: number | null;
  impliedInternationalProbability: number | null;
  gapVsLottery: number | null;
};

export type QuarterResult = {
  homeGoalProb: number;
  awayGoalProb: number;
  anyGoalProb: number;
  noGoalProb: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  expectedTotalGoals: number;
};

export type QuarterGoalDistribution = Record<Quarter, QuarterResult>;

export type UpsetPath = {
  pathType: string;
  probability: number;
  commonScores: string[];
  description: string;
};

export type PathAnalysis = {
  firstGoal: {
    noGoalProb: number;
    homeFirstGoalProb: number;
    awayFirstGoalProb: number;
    byQuarter: Record<Quarter, number>;
  };
  comeback: {
    homeComebackWinProb: number;
    awayComebackWinProb: number;
    favoriteComebackProb: number;
    underdogHoldLeadProb: number;
  };
  upsetPaths: UpsetPath[];
};

export type MispricingCandidate = {
  marketType: "1x2" | "correct_score" | "total_goals";
  selection: string;
  modelProbability: number;
  lotteryImpliedProbability: number;
  internationalImpliedProbability: number | null;
  probabilityGap: number;
  fairOdds: number;
  lotteryOdds: number;
  edgeScore: number;
  confidence: "low" | "medium" | "high";
  reason: string;
};

export type MispricingAnalysis = {
  targetMarket: "lottery";
  referenceMarket: "international";
  candidates: MispricingCandidate[];
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
    tempo: number;
    phaseShape: PhaseShape;
    favorite: FavoriteSide;
    homeQuarterWeights: [number, number, number, number];
    awayQuarterWeights: [number, number, number, number];
    homeQuarterLambda: [number, number, number, number];
    awayQuarterLambda: [number, number, number, number];
    stateReactionProfile: StateReactionProfile;
    qualificationContext: ResolvedQualificationContext;
    qualificationReactionProfile: QualificationReactionProfile;
    fitLoss: number;
  };
  marketProbabilities: {
    lottery: NormalizedMarket;
    international: NormalizedMarket;
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
    halfTime: {
      homeLeadProb: number;
      drawProb: number;
      awayLeadProb: number;
      expectedGoals: number;
    };
    totalGoals: {
      under15: number;
      over15: number;
      under25: number;
      over25: number;
      under35: number;
      over35: number;
    };
  };
  scoreDistribution: ScoreProbability[];
  topScores: ScoreProbability[];
  quarterGoalDistribution: QuarterGoalDistribution;
  pathAnalysis: PathAnalysis;
  mispricingAnalysis: MispricingAnalysis;
  diagnostics: {
    fitQuality: "low" | "medium" | "high";
    marketCompleteness: "low" | "medium" | "high";
    oddsConsistency: "low" | "medium" | "high";
    loss: {
      total: number;
      odds1x2: number;
      correctScore: number | null;
      totalGoals: number | null;
      overUnder: number | null;
    };
    warnings: string[];
  };
};
