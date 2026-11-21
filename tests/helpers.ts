import {
  applyPatch, DEFAULT_DURATIONS, DEFAULT_REGISTRY, DEFAULT_RULES, deriveState, execute, newSession, nextPhase, registryFor,
} from '../src/engine'
import { createAppStore } from '../src/app/store'
import type { AppStore } from '../src/app/store'
import type { Command, CommandResult, CustomRole, GameState, Registry, RoleId, Session, SessionConfig } from '../src/engine'

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

// ── Помощники для партий ────────────────────────────────────────────────────

/** Стол с макетов: №1 шериф, №3 крёстный отец, №4 доктор, №8 мафия, №10 проститутка. */
export const TABLE_11 = 'S c G D c c c M c P c'
const LETTERS: Record<string, RoleId> = { S: 'sheriff', c: 'civilian', G: 'godfather', D: 'doctor', M: 'mafia', P: 'prostitute' }

/** Сессия с заданной раздачей, фаза — распределение. */
export function gameWith(registry: Registry, assignment: RoleId[], config: Partial<SessionConfig> = {}): Session {
  const composition: Record<RoleId, number> = {}
  for (const id of assignment) {
    const role = registry.roles.find((r) => r.id === id)
    if (!role || role.filler) continue
    const key = role.countsWithin ?? role.id
    composition[key] = (composition[key] ?? 0) + 1
  }
  const session = newSession('test', 0, {
    playerCount: assignment.length, composition, durations: DEFAULT_DURATIONS, rules: DEFAULT_RULES,
    separateTimerStart: false, ...config,
  })
  return playWith(registry, session, { type: 'deal', assignment })
}

export function game(table: string, config?: Partial<SessionConfig>): Session {
  return gameWith(DEFAULT_REGISTRY, table.trim().split(/\s+/).map((l) => LETTERS[l] ?? l), config)
}

/** execute + applyPatch + запись отмены; бросает, если команда отклонена. */
export function playWith(registry: Registry, s: Session, ...cmds: Command[]): Session {
  let cur = s
  for (const cmd of cmds) {
    const result = execute(cur, cmd, registry)
    if (!result.ok) throw new Error(`команда ${cmd.type} отклонена: ${result.reason}`)
    let next = cur.nextSeq
    const applied = applyPatch(cur.log, result.patch, cur.nextSeq, () => `e${next++}`)
    cur = { ...cur, log: applied.log, nextSeq: applied.nextSeq, undo: [...cur.undo, applied.undo] }
  }
  return cur
}

export const play = (s: Session, ...cmds: Command[]): Session => playWith(DEFAULT_REGISTRY, s, ...cmds)
export const attempt = (s: Session, cmd: Command): CommandResult => execute(s, cmd, DEFAULT_REGISTRY)
export const st = (s: Session): GameState => deriveState(s, DEFAULT_REGISTRY)

/** До начала Дня n: дни без действий, ночи без записей с итогом «никто не выбыл». */
export function toDayWith(registry: Registry, s: Session, n: number): Session {
  let cur = s
  for (;;) {
    const phase = deriveState(cur, registry).phase ?? { kind: 'deal' as const }
    if (phase.kind === 'day' && phase.n >= n) return cur
    cur = phase.kind === 'night'
      ? playWith(registry, cur, { type: 'confirmNight', died: [] })
      : playWith(registry, cur, { type: 'startPhase', phase: nextPhase(phase) })
  }
}
export const toDay = (s: Session, n: number): Session => toDayWith(DEFAULT_REGISTRY, s, n)

/** Запись ночного действия. */
export const act = (actionId: string, actor: number | null, target: number | null): Command =>
  ({ type: 'recordNightAction', actionId, actor, target })
/** Начало Ночи 1. */
export const n1 = (table = TABLE_11): Session =>
  play(toDay(game(table), 1), { type: 'startPhase', phase: { kind: 'night', n: 1 } })

// ── Свои роли ───────────────────────────────────────────────────────────────

export const JOURNALIST: CustomRole = { id: 'custom_j', name: 'журналист', side: 'red', night: true }
export const MANIAC: CustomRole = { id: 'custom_m', name: 'маньяк', side: 'black', night: false }
/** №1 шериф, №3 крёстный отец, №4 доктор, №6 журналист, №8 мафия, №9 маньяк, №10 проститутка. */
export const CUSTOM_TABLE = ['sheriff', 'civilian', 'godfather', 'doctor', 'civilian', 'custom_j', 'civilian', 'mafia', 'custom_m', 'prostitute', 'civilian']

/** Игра со своими ролями на начало Ночи 1 и её справочник. */
export function customNight(roles: CustomRole[] = [JOURNALIST, MANIAC], assignment: RoleId[] = CUSTOM_TABLE): { s: Session; registry: Registry } {
  const registry = registryFor(DEFAULT_REGISTRY, roles)
  const dealt = gameWith(registry, assignment, { customRoles: roles })
  const s = playWith(registry, dealt, { type: 'startPhase', phase: { kind: 'day', n: 1 } }, { type: 'startPhase', phase: { kind: 'night', n: 1 } })
  return { s, registry }
}

// ── Помощники для приложения ────────────────────────────────────────────────

/** Хранилище в памяти; failWrites имитирует приватное окно и переполнение. */
export function fakeKV() {
  const map = new Map<string, string>()
  return {
    failWrites: false,
    getItem: (k: string) => map.get(k) ?? null,
    setItem(k: string, v: string) {
      if (this.failWrites) throw new Error('QuotaExceededError')
      map.set(k, v)
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
  }
}

/** Окружение для тестов: счётчик id, часы-переменная time, randomInt всегда 0. */
export function testEnv(kv = fakeKV()) {
  let n = 0
  const env = {
    kv,
    time: 1_700_000_000_000,
    now: () => env.time,
    newId: () => `id${++n}`,
    randomInt: ((): number => 0) as (maxExclusive: number) => number,
    registry: DEFAULT_REGISTRY,
    beep: vi.fn(),
    keepAwake: vi.fn(),
  }
  return env
}
export type TestEnv = ReturnType<typeof testEnv>

/** Приложение с розданной игрой на 11 игроков. */
export function seeded(env: TestEnv): AppStore {
  const app = createAppStore(env)
  app.newGame()
  app.editDraft({ playerCount: 11, composition: { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1 } })
  app.dealDraft()
  return app
}
