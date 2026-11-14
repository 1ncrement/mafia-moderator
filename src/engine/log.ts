import type { GameEvent, LogPatch, PhaseRef, UndoEntry } from './types'

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
