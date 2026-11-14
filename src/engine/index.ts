// Публичный интерфейс движка. Всё остальное приложение импортирует только отсюда.
export * from './types'
export * from './setup'
export * from './deal'
export * from './log'
export * from './commands'
export { aliveSeats, currentPhase, deriveState, playersAt, rolesBySeat } from './derive'
export { DEFAULT_REGISTRY } from './roles/registry'
