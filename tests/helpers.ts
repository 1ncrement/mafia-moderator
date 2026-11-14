export const countBy = (xs: string[]): Record<string, number> =>
  xs.reduce<Record<string, number>>((acc, x) => ({ ...acc, [x]: (acc[x] ?? 0) + 1 }), {})
