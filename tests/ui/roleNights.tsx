import { screen } from '@testing-library/react'
import type { AppStore } from '../../src/app/store'
import type { SessionConfig } from '../../src/engine'
import { seedGame } from './helpers'

// Помощники тестов новых ролей: ночь с записями и списки итога ночи.

export type Rec = [actionId: string, actor: number | null, target: number | null, target2?: number | null]
export const N1 = { kind: 'night', n: 1 } as const
export const record = (a: AppStore, [actionId, actor, target, target2]: Rec) =>
  a.dispatch({ type: 'recordNightAction', actionId, actor, target, ...(target2 === undefined ? {} : { target2 }) })

/** Ночь 1 за столом table: роли открыты, записи сделаны, открыт шаг step (по умолчанию — первый шаг ночи). */
export const nightOf = (table: string, records: Rec[] = [], step?: string, config?: Partial<SessionConfig>) => (a: AppStore) => {
  seedGame(a, table, 1, config)
  a.dispatch({ type: 'startPhase', phase: N1 })
  for (const rec of records) record(a, rec)
  if (step !== undefined) a.dispatch({ type: 'enterStep', step })
}
/** Ночь 1 с записями, открыт итог. */
export const summaryOf = (table: string, records: Rec[] = [], config?: Partial<SessionConfig>) => nightOf(table, records, 'summary', config)

export const leaving = () => screen.getByRole('group', { name: 'Покидают стол' })
export const staying = () => screen.queryByRole('group', { name: 'Остаются в игре' })
export const mark = (n: number) => screen.getByRole('checkbox', { name: `№${n} покидает стол` })
export const card = (n: number) => (screen.queryByRole('button', { name: `Игрок №${n}` }) ?? screen.getByRole('button', { name: `Выбрать игрока №${n}` }))
export const outSeats = (a: AppStore) => a.getState().game!.players.filter((p) => p.status === 'out').map((p) => p.seat)
