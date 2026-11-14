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
import {
  applyPatch, DEFAULT_DURATIONS, DEFAULT_REGISTRY, DEFAULT_RULES, deriveState, execute, newSession, nextPhase,
} from '../src/engine'
import type { Command, CommandResult, GameState, Registry, RoleId, Session, SessionConfig } from '../src/engine'

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

/** До начала Дня n: дни без действий, ночи без записей. */
export function toDay(s: Session, n: number): Session {
  let cur = s
  for (;;) {
    const phase = st(cur).phase ?? { kind: 'deal' as const }
    if (phase.kind === 'day' && phase.n >= n) return cur
    cur = play(cur, { type: 'startPhase', phase: nextPhase(phase) })
  }
}
