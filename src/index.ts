export { simulate } from "./engine.js";
export { fitLambdas } from "./market-calibrator.js";
export { normalizeOdds1x2 } from "./odds-normalizer.js";
export {
  poisson1x2Probabilities,
  poissonProbability,
  samplePoisson,
} from "./poisson.js";
export { createSeededRandom } from "./random.js";
export type {
  Odds1x2,
  Probabilities1x2,
  QuarterGoalEngineInput,
  QuarterGoalEngineOutput,
  ScoreProbability,
} from "./types.js";

