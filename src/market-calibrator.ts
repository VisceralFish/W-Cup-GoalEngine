import { poisson1x2Probabilities } from "./poisson.js";
import type { Probabilities1x2 } from "./types.js";

export type CalibrationResult = {
  lambdaHome: number;
  lambdaAway: number;
  loss: number;
};

function squaredError(
  actual: Probabilities1x2,
  target: Probabilities1x2,
): number {
  return (
    (actual.homeWin - target.homeWin) ** 2 +
    (actual.draw - target.draw) ** 2 +
    (actual.awayWin - target.awayWin) ** 2
  );
}

export function fitLambdas(target: Probabilities1x2): CalibrationResult {
  let best: CalibrationResult = {
    lambdaHome: 1.35,
    lambdaAway: 1.05,
    loss: Number.POSITIVE_INFINITY,
  };

  for (let homeStep = 2; homeStep <= 90; homeStep += 1) {
    const lambdaHome = homeStep * 0.05;

    for (let awayStep = 2; awayStep <= 90; awayStep += 1) {
      const lambdaAway = awayStep * 0.05;
      const lambdaTotal = lambdaHome + lambdaAway;
      if (lambdaTotal < 0.3 || lambdaTotal > 6.5) continue;

      const probabilities = poisson1x2Probabilities(lambdaHome, lambdaAway);
      const loss = squaredError(probabilities, target);

      if (loss < best.loss) {
        best = { lambdaHome, lambdaAway, loss };
      }
    }
  }

  return best;
}

