export const countBy = (xs: string[]): Record<string, number> =>
  xs.reduce<Record<string, number>>((acc, x) => ({ ...acc, [x]: (acc[x] ?? 0) + 1 }), {})

/** Детерминированный генератор целых (mulberry32) для тестов раздачи. */
export function seededInt(seed: number): (maxExclusive: number) => number {
  let a = seed >>> 0
  return (maxExclusive) => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * maxExclusive)
  }
}
