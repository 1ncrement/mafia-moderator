import { DEFAULT_REGISTRY } from '../engine'
import { cryptoRandomInt } from '../platform/rng'
import type { KV } from '../platform/storage'
import type { Env } from './store'

/** localStorage может быть недоступен целиком (приватное окно, запрет в настройках). */
function browserKV(): KV {
  try {
    const ls = window.localStorage
    ls.getItem('mafia:probe')
    return ls
  } catch {
    return {
      getItem: () => null,
      setItem: () => {
        throw new Error('localStorage недоступен')
      },
      removeItem: () => {},
    }
  }
}

function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // file:// в старых браузерах — не «безопасный контекст», randomUUID там нет.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function browserEnv(): Env {
  return { kv: browserKV(), now: () => Date.now(), newId, randomInt: cryptoRandomInt, registry: DEFAULT_REGISTRY }
}
