import type { PhaseRef, Session, SessionConfig, SideId } from '../engine'

// Единственный модуль, который знает о хранилище браузера. Любая ошибка чтения или записи
// превращается в результат, а не в исключение: приватное окно и переполнение не роняют приложение.

export type KV = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export type SessionMeta = {
  id: string
  createdAt: number
  updatedAt: number
  status: 'deal' | 'running' | 'finished'
  playerCount: number
  alive: number
  phase: PhaseRef
  winner: SideId | null
}

export type Lang = 'ru' | 'uk'
export type Settings = { lang: Lang; sound: boolean; rolesHidden: boolean; lastConfig: SessionConfig | null }
export const DEFAULT_SETTINGS: Settings = { lang: 'ru', sound: true, rolesHidden: false, lastConfig: null }

/** null — такой сессии нет; ok: false — данные есть, но прочитать их нельзя (они не затираются). */
export type Loaded = { ok: true; session: Session } | { ok: false; raw: string } | null

const INDEX = 'mafia:index'
const ACTIVE = 'mafia:active'
const SETTINGS = 'mafia:settings'
const sessionKey = (id: string) => `mafia:session:${id}`

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function looksLikeSession(v: unknown): v is Session {
  return isRecord(v) && v.schemaVersion === 1 && typeof v.id === 'string' && Array.isArray(v.log)
    && Array.isArray(v.undo) && typeof v.nextSeq === 'number' && isRecord(v.config)
    && typeof v.config.playerCount === 'number' && isRecord(v.config.durations) && isRecord(v.config.rules)
}

export function createStorage(kv: KV) {
  const read = (key: string): string | null => {
    try {
      return kv.getItem(key)
    } catch {
      return null
    }
  }
  const write = (key: string, value: string): boolean => {
    try {
      kv.setItem(key, value)
      return true
    } catch {
      return false
    }
  }
  const drop = (key: string): void => {
    try {
      kv.removeItem(key)
    } catch {
      // хранилище недоступно — удалять нечего
    }
  }
  const parse = (raw: string | null): unknown => {
    if (raw === null) return undefined
    try {
      return JSON.parse(raw) as unknown
    } catch {
      return undefined
    }
  }

  const list = (): SessionMeta[] => {
    const data = parse(read(INDEX))
    if (!Array.isArray(data)) return []
    return (data as unknown[])
      .filter((m): m is SessionMeta => isRecord(m) && typeof m.id === 'string' && typeof m.updatedAt === 'number' && isRecord(m.phase))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  return {
    list,

    load(id: string): Loaded {
      const raw = read(sessionKey(id))
      if (raw === null) return null
      const data = parse(raw)
      return looksLikeSession(data) ? { ok: true, session: data } : { ok: false, raw }
    },

    /** Запись сессии и строки индекса. false — сохранить не удалось. */
    save(session: Session, meta: SessionMeta): boolean {
      if (!write(sessionKey(session.id), JSON.stringify(session))) return false
      return write(INDEX, JSON.stringify([meta, ...list().filter((m) => m.id !== session.id)]))
    },

    remove(id: string): void {
      drop(sessionKey(id))
      write(INDEX, JSON.stringify(list().filter((m) => m.id !== id)))
      if (read(ACTIVE) === id) drop(ACTIVE)
    },

    activeId(): string | null {
      return read(ACTIVE)
    },

    setActiveId(id: string | null): void {
      if (id === null) drop(ACTIVE)
      else write(ACTIVE, id)
    },

    settings(): Settings {
      const data = parse(read(SETTINGS))
      if (!isRecord(data)) return DEFAULT_SETTINGS
      return {
        lang: data.lang === 'uk' ? 'uk' : 'ru',
        sound: typeof data.sound === 'boolean' ? data.sound : DEFAULT_SETTINGS.sound,
        rolesHidden: typeof data.rolesHidden === 'boolean' ? data.rolesHidden : DEFAULT_SETTINGS.rolesHidden,
        lastConfig: isRecord(data.lastConfig) && typeof data.lastConfig.playerCount === 'number'
          ? (data.lastConfig as SessionConfig) : null,
      }
    },

    saveSettings(s: Settings): boolean {
      return write(SETTINGS, JSON.stringify(s))
    },
  }
}

export type Storage = ReturnType<typeof createStorage>
