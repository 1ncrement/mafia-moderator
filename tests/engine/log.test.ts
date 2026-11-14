import { applyPatch, applyUndo, EMPTY_PATCH, nextPhase, phaseOrder } from '../../src/engine/log'
import type { GameEvent, PhaseRef } from '../../src/engine/types'

const day1: PhaseRef = { kind: 'day', n: 1 }
const ids = () => { let i = 0; return () => `e${++i}` }
test('порядок и смена фаз', () => {
  const phases: PhaseRef[] = [{ kind: 'deal' }, day1, { kind: 'night', n: 1 }, { kind: 'day', n: 2 }]
  expect(phases.map(phaseOrder)).toEqual([0, 1, 2, 3])
  expect(nextPhase({ kind: 'deal' })).toEqual(day1)
  expect(nextPhase(day1)).toEqual({ kind: 'night', n: 1 })
  expect(nextPhase({ kind: 'night', n: 1 })).toEqual({ kind: 'day', n: 2 })
})
test('пачка получает id, возрастающий seq и общий tx', () => {
  const r = applyPatch([], { ...EMPTY_PATCH, add: [
    { type: 'circle_opened', phase: day1, first: 5 }, { type: 'speech_started', phase: day1, kind: 'speech', seat: 5 }] }, 10, ids())
  expect(r.log.map((e) => e.seq)).toEqual([10, 11]); expect(r.nextSeq).toBe(12)
  expect(r.log[0]!.tx).toBe(r.log[1]!.tx); expect(r.undo.added).toEqual(['e1', 'e2'])
})
test('отмена возвращает журнал в точности, включая правку и удаление', () => {
  const a = applyPatch([], { ...EMPTY_PATCH, add: [
    { type: 'nominated', phase: day1, by: 5, target: 7, order: 1 }, { type: 'nominated', phase: day1, by: 6, target: 3, order: 2 }] }, 1, ids())
  const edited = { ...a.log[0]!, target: 9 } as GameEvent
  const b = applyPatch(a.log, { add: [], replace: [edited], remove: [a.log[1]!.id] }, a.nextSeq, ids())
  expect(b.log).toHaveLength(1); expect(b.log[0]).toMatchObject({ target: 9, seq: 1, edited: true })
  expect(applyUndo(b.log, b.undo)).toEqual(a.log)
})
