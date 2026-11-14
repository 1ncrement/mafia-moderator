import type { RandomInt } from '../engine/deal'

/**
 * Равномерное целое на crypto.getRandomValues. Значения вне кратного диапазона
 * отбрасываются, поэтому смещения по модулю нет.
 */
export const cryptoRandomInt: RandomInt = (maxExclusive) => {
  if (!(maxExclusive > 1)) return 0
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    const value = buf[0] as number
    if (value < limit) return value % maxExclusive
  }
}
