// Все типы движка. Движок не знает о React, DOM, часах и случайности.

export type Seat = number
export type RoleId = string
export type SideId = string
export type EffectId = 'kill' | 'heal' | 'block' | 'check_side' | 'find_role'

/** colorVar — переменная CSS для точки стороны; ring — светлое кольцо вокруг точки. */
export type SideDef = { id: SideId; nameKey: string; colorVar: string; ring?: true }

export type RoleDef = {
  id: RoleId
  nameKey: string
  side: SideId
  /** Добирает остаток игроков (мирный житель). */
  filler?: true
  defaultCount: number
  /** Входит в счётчик другой роли в составе. */
  countsWithin?: RoleId
  /** Сколько таких внутри родителя. */
  exactCount?: number
  /** Чьим названием показана на столе. */
  displayAs?: RoleId
  /** Ключ пометки на карточке. */
  markKey?: string
  seenBySheriffAs: SideId
}

export type NightActionDef = {
  id: string
  order: number
  effect: EffectId
  performers: RoleId[]
  scope: 'team' | 'each'
  /** Блок лидера отменяет командное действие. */
  leader?: RoleId
  /** Кто выполняет, когда живых performers нет. */
  inheritedBy?: RoleId
  /** Для find_role: какую роль ищут. */
  findRole?: RoleId
  noRepeatTarget?: true
  stepKey: string
  questionKey: string
}

export type Registry = { sides: SideDef[]; roles: RoleDef[]; nightActions: NightActionDef[] }

// ── Журнал событий ──────────────────────────────────────────────────────────

export type PhaseRef = { kind: 'deal' } | { kind: 'day'; n: number } | { kind: 'night'; n: number }
export type DayStep = 'balagan' | 'speeches' | 'defense' | 'vote' | 'tiebreak' | 'revote' | 'farewell'
/** DayStep, id ночного шага или 'summary'. */
export type StepId = string
export type SpeechKind = 'balagan' | 'speech' | 'defense' | 'tiebreak' | 'farewell'
export type OutCause = 'shot' | 'voted'

type Ev<T extends string, P> = {
  id: string
  seq: number
  /** Общий для всех событий одной команды ведущего. */
  tx: string
  phase: PhaseRef
  edited?: true
  manual?: true
  type: T
} & P

export type GameEvent =
  | Ev<'roles_dealt', { assignment: RoleId[] }>
  | Ev<'roles_swapped', { a: Seat; b: Seat }>
  | Ev<'phase_started', object>
  | Ev<'step_entered', { step: StepId }>
  | Ev<'night_action', { actionId: string; actor: Seat | null; target: Seat | null }>
  | Ev<'night_confirmed', { hinted: Seat | null; chosen: Seat | null }>
  | Ev<'status_set', { seat: Seat; status: 'alive' | 'out'; cause?: OutCause; source: 'night' | 'vote' | 'manual' }>
  | Ev<'circle_opened', { first: Seat }>
  | Ev<'speech_started', { kind: SpeechKind; seat: Seat | null }>
  | Ev<'speech_ended', { startId: string }>
  | Ev<'speaker_skipped', { seat: Seat }>
  | Ev<'nominated', { by: Seat | null; target: Seat; order: number }>
  | Ev<'votes_set', { ballot: 1 | 2; candidate: Seat; count: number }>
  | Ev<'voters_set', { ballot: 1 | 2; count: number }>
  | Ev<'vote_resolved', { ballot: 1 | 2; outcome: 'eliminated' | 'tie' | 'nobody'; seats: Seat[] }>
  | Ev<'game_finished', { winner: SideId | null }>

export type EventOf<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>
export type NewEvent = GameEvent extends infer E ? (E extends GameEvent ? Omit<E, 'id' | 'seq' | 'tx'> : never) : never
/** Пачка изменений журнала от одной команды. */
export type LogPatch = { add: NewEvent[]; replace: GameEvent[]; remove: string[] }
/** Всё, что нужно, чтобы отменить пачку целиком. */
export type UndoEntry = { added: string[]; replaced: GameEvent[]; removed: GameEvent[] }
