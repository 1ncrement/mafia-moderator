import { cryptoRandomInt } from '../../src/platform/rng'

test('cryptoRandomInt остаётся в диапазоне', () => {
  for (let i = 0; i < 2000; i++) { const v = cryptoRandomInt(7); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(7) }
})
