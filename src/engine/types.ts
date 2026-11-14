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

// ── Таймер (логика — в timer.ts) ────────────────────────────────────────────

export type TimerKind = SpeechKind | 'free'
export type TimerState = {
  kind: TimerKind
  seat: Seat | null
  durationMs: number
  status: 'ready' | 'running' | 'paused'
  /** Момент окончания по системным часам; источник истины, пока таймер идёт. */
  endsAt: number | null
  /** Остаток, пока таймер стоит. Отрицательный — перерасход на паузе. */
  remainingMs: number
}

// ── Сессия ──────────────────────────────────────────────────────────────────

/** Длительности в секундах. */
export type Durations = { speech: number; balagan: number; defense: number; tiebreak: number; farewell: number }
/** Домашние правила: с какого дня выставляют и с какого дня есть балаган. */
export type Rules = { nominationsFromDay: number; balaganFromDay: number }
export type SessionConfig = {
  playerCount: number
  composition: Record<RoleId, number>
  durations: Durations
  rules: Rules
  separateTimerStart: boolean
}
/** В сессии лежат настройки и журнал. Состояние стола не хранится — его выводит deriveState. */
export type Session = {
  schemaVersion: 1
  id: string
  createdAt: number
  updatedAt: number
  config: SessionConfig
  log: GameEvent[]
  nextSeq: number
  undo: UndoEntry[]
  timer: TimerState | null
  paused: boolean
}

// ── Команды ведущего ────────────────────────────────────────────────────────

export type Command =
  | { type: 'deal'; assignment: RoleId[] }
  | { type: 'swapRoles'; a: Seat; b: Seat }
  | { type: 'startPhase'; phase: PhaseRef }
  | { type: 'enterStep'; step: StepId }
  | { type: 'setStatus'; seat: Seat; status: 'alive' | 'out'; cause?: OutCause; phase?: PhaseRef }
  | { type: 'finishGame'; winner: SideId | null }
  | { type: 'resumeGame' }
  | { type: 'removeEvent'; id: string }
  // день
  | { type: 'openCircle'; first: Seat }
  /** Завершает идущую речь и начинает новую. */
  | { type: 'startSpeech'; kind: SpeechKind; seat: Seat | null }
  | { type: 'endSpeech' }
  | { type: 'skipSpeaker'; seat: Seat }
  | { type: 'nominate'; by: Seat | null; target: Seat; phase?: PhaseRef }
  | { type: 'removeNomination'; target: Seat; phase?: PhaseRef }
  | { type: 'moveNomination'; target: Seat; toIndex: number }
  | { type: 'setVotes'; ballot: 1 | 2; candidate: Seat; count: number; phase?: PhaseRef }
  | { type: 'setVoters'; ballot: 1 | 2; count: number }
  | { type: 'resetVotes'; ballot: 1 | 2 }
  | { type: 'resolveVote'; ballot: 1 | 2; outcome: 'eliminated' | 'tie' | 'nobody'; seats: Seat[] }
  // ночь
  /** force — записать, несмотря на предупреждение о повторе цели. */
  | { type: 'recordNightAction'; actionId: string; actor: Seat | null; target: Seat | null; phase?: PhaseRef; force?: true }
  | { type: 'confirmNight'; chosen: Seat | null }
  /** Ответ на «итог ночи теперь другой»: apply — исправить статусы, иначе оставить как есть. */
  | { type: 'acknowledgeNight'; night: number; apply: boolean }

export type RejectCode =
  | 'redeal_closed' | 'wrong_phase' | 'not_alive' | 'unknown_event' | 'nominations_closed'
  | 'already_nominated' | 'votes_exceed' | 'step_grey' | 'repeat_target'
export type StateWarning =
  | { code: 'night_outcome_changed'; night: number; expected: Seat | null }
  | { code: 'votes_overflow'; ballot: 1 | 2 }
export type CommandResult = { ok: true; patch: LogPatch } | { ok: false; reason: RejectCode }

// ── Выведенное состояние ────────────────────────────────────────────────────

export type PlayerView = {
  seat: Seat
  roleId: RoleId
  side: SideId
  status: 'alive' | 'out'
  cause?: OutCause
  outPhase?: PhaseRef
}
export type EndHint = 'no_black' | 'black_not_less' | null
export type GameState = {
  phase: PhaseRef | null
  step: StepId | null
  players: PlayerView[]
  counts: { total: number; alive: number; bySide: Record<SideId, number> }
  endHint: EndHint
  finished: { winner: SideId | null } | null
  warnings: StateWarning[]
  day: DayState | null
  night: NightState | null
  /** Кого проверяли действия check_side и find_role за всю игру. */
  permanentMarks: { seat: Seat; actionId: string }[]
}

// ── День ────────────────────────────────────────────────────────────────────

/** active: false — кандидат выбыл: остаётся в списке серым, в оправданиях и голосовании не участвует. */
export type Nomination = { target: Seat; by: Seat | null; order: number; eventId: string; active: boolean }
export type SpeechQueue = { done: Seat[]; waiting: Seat[] }
export type VoteHint = { outcome: 'eliminated' | 'tie'; seats: Seat[] } | null
export type VoteOutcome = 'eliminated' | 'tie' | 'nobody'
export type Ballot = {
  n: 1 | 2
  candidates: Seat[]
  voters: number
  votersOverridden: boolean
  /** auto — число подставлено движком (остаток последнему или ноль, когда голоса кончились). */
  entries: { candidate: Seat; count: number | null; auto: boolean }[]
  remaining: number
  complete: boolean
  /** Явно введённых голосов больше, чем голосующих. */
  overflow: boolean
  hint: VoteHint
  resolved: { outcome: VoteOutcome; seats: Seat[] } | null
}
export type DayState = {
  n: number
  nominationsOpen: boolean
  opener: Seat | null
  previousOpener: Seat | null
  spoken: Seat[]
  skipped: Seat[]
  waiting: Seat[]
  speaking: { kind: SpeechKind; seat: Seat | null; eventId: string } | null
  nominations: Nomination[]
  ballots: Ballot[]
  defense: SpeechQueue
  tiebreak: SpeechQueue
  farewell: SpeechQueue
}

// ── Ночь ────────────────────────────────────────────────────────────────────

export type CheckAnswer = { kind: 'side'; side: SideId } | { kind: 'found'; found: boolean } | { kind: 'blocked' }
export type NightStep = {
  /** actionId для командного и серого шага, иначе `${actionId}:${actor}`. */
  id: string
  actionId: string
  effect: EffectId
  actor: Seat | null
  actors: Seat[]
  /** Роль, которая выполняет шаг этой ночью. */
  performerRole: RoleId
  /** Действие перешло к другой роли (выстрел — к проститутке). */
  inherited: boolean
  /** Носителей в игре нет: шаг остаётся «для вида», записать в него нельзя. */
  grey: boolean
  recorded: boolean
  target: Seat | null
  answer?: CheckAnswer
  /** Событие записи — для правки в журнале. */
  eventId: string | null
  edited: boolean
  lastNight: { recorded: boolean; target: Seat | null; answer?: CheckAnswer }
}
export type NightOutcome = {
  shotAt: Seat | null
  dies: Seat | null
  reason: 'shot' | 'healed' | 'no_shot' | 'shooter_blocked'
  blocked: Seat[]
  healed: Seat[]
}
export type NightState = {
  n: number
  steps: NightStep[]
  outcome: NightOutcome
  /** У каждого несерого шага есть запись. */
  complete: boolean
  confirmed: { hinted: Seat | null; chosen: Seat | null } | null
}
