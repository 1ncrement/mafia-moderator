import type { EventOf, GameEvent, LogPatch, PhaseRef, UndoEntry } from './types'

export const EMPTY_PATCH: LogPatch = { add: [], replace: [], remove: [] }

/** Порядок фаз: распределение 0, День n → 2n − 1, Ночь n → 2n. */
export function phaseOrder(p: PhaseRef): number {
  if (p.kind === 'deal') return 0
  return p.kind === 'day' ? 2 * p.n - 1 : 2 * p.n
}

/** Распределение → День 1 → Ночь 1 → День 2 → … */
export function nextPhase(p: PhaseRef): PhaseRef {
  if (p.kind === 'deal') return { kind: 'day', n: 1 }
  return p.kind === 'day' ? { kind: 'night', n: p.n } : { kind: 'day', n: p.n + 1 }
}

export function samePhase(a: PhaseRef, b: PhaseRef): boolean {
  return phaseOrder(a) === phaseOrder(b)
}

const bySeq = (a: GameEvent, b: GameEvent) => a.seq - b.seq

/**
 * Применяет пачку к журналу. Новые события получают id, возрастающий seq и общий tx.
 * Заменённое событие сохраняет id, seq и tx оригинала и получает edited: true.
 */
export function applyPatch(
  log: GameEvent[],
  patch: LogPatch,
  nextSeq: number,
  newId: () => string,
): { log: GameEvent[]; nextSeq: number; undo: UndoEntry } {
  const toRemove = new Set(patch.remove)
  const toReplace = new Map(patch.replace.map((e) => [e.id, e]))
  const removed: GameEvent[] = []
  const replaced: GameEvent[] = []
  const out: GameEvent[] = []

  for (const event of log) {
    if (toRemove.has(event.id)) {
      removed.push(event)
      continue
    }
    const next = toReplace.get(event.id)
    if (next) {
      replaced.push(event)
      out.push({ ...next, id: event.id, seq: event.seq, tx: event.tx, edited: true })
    } else {
      out.push(event)
    }
  }

  let seq = nextSeq
  let tx: string | null = null
  const added: string[] = []
  for (const fresh of patch.add) {
    const id = newId()
    tx ??= id
    out.push({ ...fresh, id, seq: seq++, tx } as GameEvent)
    added.push(id)
  }

  return { log: out.sort(bySeq), nextSeq: seq, undo: { added, replaced, removed } }
}

/** Отменяет пачку: убирает добавленное, возвращает заменённое и удалённое. */
export function applyUndo(log: GameEvent[], entry: UndoEntry): GameEvent[] {
  const added = new Set(entry.added)
  const original = new Map(entry.replaced.map((e) => [e.id, e]))
  const out = log.filter((e) => !added.has(e.id)).map((e) => original.get(e.id) ?? e)
  const present = new Set(out.map((e) => e.id))
  for (const event of [...entry.replaced, ...entry.removed]) {
    if (!present.has(event.id)) {
      out.push(event)
      present.add(event.id)
    }
  }
  return out.sort(bySeq)
}

// ── Чтение журнала ──────────────────────────────────────────────────────────

/** События в порядке для вывода: по фазе, внутри фазы по seq. */
export function orderedLog(log: readonly GameEvent[]): GameEvent[] {
  return [...log].sort((a, b) => phaseOrder(a.phase) - phaseOrder(b.phase) || a.seq - b.seq)
}

/** События одной фазы по возрастанию seq. */
export function eventsOf(log: readonly GameEvent[], phase: PhaseRef): GameEvent[] {
  return log.filter((e) => samePhase(e.phase, phase)).sort(bySeq)
}

/** Последнее по seq событие данного типа. */
export function lastOf<T extends GameEvent['type']>(
  log: readonly GameEvent[],
  type: T,
  where?: (e: EventOf<T>) => boolean,
): EventOf<T> | null {
  let found: EventOf<T> | null = null
  for (const e of log) {
    if (e.type !== type) continue
    const typed = e as EventOf<T>
    if (where && !where(typed)) continue
    if (!found || typed.seq > found.seq) found = typed
  }
  return found
}

export function allOf<T extends GameEvent['type']>(log: readonly GameEvent[], type: T): EventOf<T>[] {
  return log.filter((e) => e.type === type) as EventOf<T>[]
}

/** Текущая фаза — фаза последнего phase_started; до него — распределение. */
export function currentPhase(log: readonly GameEvent[]): PhaseRef {
  return lastOf(log, 'phase_started')?.phase ?? { kind: 'deal' }
}
