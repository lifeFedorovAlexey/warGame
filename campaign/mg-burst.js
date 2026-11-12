// The three transients in combat-sfx/mg-burst.ogg are spaced by 120 ms.
export const mgRoundCount = 3;
export const mgRoundSpacing = .12;
export const twinBarrelDelay = mgRoundSpacing / 2;
export const mgFlashDuration = .065;

export function mgRecoil(age) {
  const round = Math.floor((age + 1e-9) / mgRoundSpacing);
  if (round < 0 || round >= mgRoundCount) return 0;
  const phase = Math.max(0, age - round * mgRoundSpacing);
  return Math.max(0, 1 - phase / .085) ** 2;
}
