import { currentPhase, isSeat, lastOf } from './derive'
import { EMPTY_PATCH, nextPhase, samePhase } from './log'
import type { Command, CommandResult, LogPatch, NewEvent, PhaseRef, Registry, RejectCode, Session } from './types'

// Команда ведущего → пачка событий. Ничего не происходит само:
// статус, фаза и шаг меняются только командой.

const ok = (patch: Partial<LogPatch>): CommandResult => ({ ok: true, patch: { ...EMPTY_PATCH, ...patch } })
const no = (reason: RejectCode): CommandResult => ({ ok: false, reason })
const add = (...events: NewEvent[]): CommandResult => ok({ add: events })

export function execute(session: Session, cmd: Command, _registry: Registry): CommandResult {
  const log = session.log
  const phase: PhaseRef = currentPhase(log)

  switch (cmd.type) {
    case 'deal': {
      if (phase.kind !== 'deal') return no('redeal_closed')
      // Новая раздача заменяет прежнюю вместе с обменами, сделанными по ней.
      const stale = log.filter((e) => e.type === 'roles_dealt' || e.type === 'roles_swapped').map((e) => e.id)
      return ok({ remove: stale, add: [{ type: 'roles_dealt', phase: { kind: 'deal' }, assignment: [...cmd.assignment] }] })
    }

    case 'swapRoles': {
      if (!isSeat(session, cmd.a) || !isSeat(session, cmd.b)) return no('not_alive')
      if (cmd.a === cmd.b) return ok({})
      return add({ type: 'roles_swapped', phase, manual: true, a: cmd.a, b: cmd.b })
    }

    case 'startPhase': {
      if (!samePhase(cmd.phase, nextPhase(phase))) return no('wrong_phase')
      return add({ type: 'phase_started', phase: cmd.phase })
    }

    case 'enterStep': {
      if (phase.kind === 'deal') return no('wrong_phase')
      return add({ type: 'step_entered', phase, step: cmd.step })
    }

    case 'setStatus': {
      if (!isSeat(session, cmd.seat)) return no('not_alive')
      const event: NewEvent = cmd.status === 'out'
        ? { type: 'status_set', phase: cmd.phase ?? phase, manual: true, seat: cmd.seat, status: 'out', cause: cmd.cause, source: 'manual' }
        : { type: 'status_set', phase: cmd.phase ?? phase, manual: true, seat: cmd.seat, status: 'alive', source: 'manual' }
      return add(event)
    }

    case 'finishGame': {
      const finished = lastOf(log, 'game_finished')
      if (finished) return ok({ replace: [{ ...finished, winner: cmd.winner }] })
      return add({ type: 'game_finished', phase, winner: cmd.winner })
    }

    case 'resumeGame':
      return ok({ remove: log.filter((e) => e.type === 'game_finished').map((e) => e.id) })

    case 'removeEvent': {
      if (!log.some((e) => e.id === cmd.id)) return no('unknown_event')
      return ok({ remove: [cmd.id] })
    }
  }
}
