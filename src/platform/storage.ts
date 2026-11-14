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

/** Событие журнала, с которым вывод состояния не упадёт: есть id, порядок, тип и фаза; у раздачи — список ролей. */
const looksLikeEvent = (e: unknown): boolean =>
  isRecord(e) && typeof e.id === 'string' && typeof e.seq === 'number' && typeof e.type === 'string'
  && isRecord(e.phase) && typeof e.phase.kind === 'string'
  && (e.type !== 'roles_dealt' || (Array.isArray(e.assignment) && e.assignment.every((role) => typeof role === 'string')))

const finite = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

/** Строка списка игр из хранилища: испорченные поля заменяются безопасными значениями, строка остаётся в списке. */
function toMeta(m: unknown): SessionMeta | null {
  if (!isRecord(m) || typeof m.id !== 'string' || typeof m.updatedAt !== 'number' || !Number.isFinite(m.updatedAt)) return null
  const phase = isRecord(m.phase) ? m.phase : {}
  const numbered = (phase.kind === 'day' || phase.kind === 'night') && typeof phase.n === 'number' && Number.isFinite(phase.n)
  return {
    id: m.id,
    createdAt: finite(m.createdAt, m.updatedAt),
    updatedAt: m.updatedAt,
    status: m.status === 'deal' || m.status === 'finished' ? m.status : 'running',
    playerCount: finite(m.playerCount, 0),
    alive: finite(m.alive, 0),
    phase: numbered ? { kind: phase.kind as 'day' | 'night', n: phase.n as number } : { kind: 'deal' },
    winner: typeof m.winner === 'string' ? m.winner : null,
  }
}

const DURATION_KEYS = ['speech', 'balagan', 'defense', 'tiebreak', 'farewell']

function looksLikeConfig(c: unknown): c is SessionConfig {
  return isRecord(c) && Number.isInteger(c.playerCount) && isRecord(c.composition)
    && isRecord(c.durations) && DURATION_KEYS.every((k) => typeof (c.durations as Record<string, unknown>)[k] === 'number')
    && isRecord(c.rules) && typeof c.rules.nominationsFromDay === 'number' && typeof c.rules.balaganFromDay === 'number'
    && typeof c.separateTimerStart === 'boolean'
}

function looksLikeSession(v: unknown): v is Session {
  return isRecord(v) && v.schemaVersion === 1 && typeof v.id === 'string' && Array.isArray(v.log)
    && Array.isArray(v.undo) && typeof v.nextSeq === 'number' && looksLikeConfig(v.config)
    && v.log.every(looksLikeEvent)
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
      .flatMap((m) => toMeta(m) ?? [])
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
        lastConfig: looksLikeConfig(data.lastConfig) ? data.lastConfig : null,
      }
    },

    saveSettings(s: Settings): boolean {
      return write(SETTINGS, JSON.stringify(s))
    },
  }
}

export type Storage = ReturnType<typeof createStorage>
