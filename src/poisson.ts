import type { Probabilities1x2 } from "./types.js";

export function poissonProbability(goals: number, lambda: number): number {
  if (!Number.isInteger(goals) || goals < 0) {
    throw new Error("goals must be a non-negative integer");
  }
  if (!Number.isFinite(lambda) || lambda <= 0) {
    throw new Error("lambda must be a finite number greater than 0");
  }

  let factorial = 1;
  for (let value = 2; value <= goals; value += 1) {
    factorial *= value;
  }

  return (Math.exp(-lambda) * lambda ** goals) / factorial;
}

export function poisson1x2Probabilities(
  lambdaHome: number,
  lambdaAway: number,
  maxGoals = 12,
): Probabilities1x2 {
  const home = Array.from(
    { length: maxGoals + 1 },
    (_, goals) => poissonProbability(goals, lambdaHome),
  );
  const away = Array.from(
    { length: maxGoals + 1 },
    (_, goals) => poissonProbability(goals, lambdaAway),
  );

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let includedMass = 0;

  for (let homeGoals = 0; homeGoals <= maxGoals; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= maxGoals; awayGoals += 1) {
      const probability = home[homeGoals]! * away[awayGoals]!;
      includedMass += probability;

      if (homeGoals > awayGoals) homeWin += probability;
      else if (homeGoals < awayGoals) awayWin += probability;
      else draw += probability;
    }
  }

  return {
    homeWin: homeWin / includedMass,
    draw: draw / includedMass,
    awayWin: awayWin / includedMass,
  };
}

export function samplePoisson(lambda: number, random: () => number): number {
  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;

  do {
    count += 1;
    product *= random();
  } while (product > limit);

  return count - 1;
}

