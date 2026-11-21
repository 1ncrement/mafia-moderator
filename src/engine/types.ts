// Все типы движка. Движок не знает о React, DOM, часах и случайности.

export type Seat = number
export type RoleId = string
export type SideId = string
/** note — запись выбора своей роли: шаг и запись есть, в расчёте итога ночи не участвует. */
export type EffectId = 'kill' | 'heal' | 'block' | 'check_side' | 'find_role' | 'note'

/** colorVar — переменная CSS для точки стороны; ring — светлое кольцо вокруг точки. */
export type SideDef = { id: SideId; nameKey: string; colorVar: string; ring?: true }

/** Роль, которую создал ведущий. night — у роли есть ночной шаг, выбор которого только записывается. */
export type CustomRole = { id: RoleId; name: string; side: SideId; night: boolean }

/** Вариант опции-выбора. lateBlockKey — предупреждение, если этот вариант выбран, а блокирующая роль просыпается не первой. */
export type RoleOptionChoice = { value: string; labelKey: string; lateBlockKey?: string }
/**
 * Опция роли: описана в справочнике, задаётся на экране состава, значение лежит в настройках сессии (roleOptions) под id опции.
 * id уникален в пределах справочника.
 */
export type RoleOptionDef =
  | { id: string; kind: 'toggle'; default: boolean; labelKey: string }
  | { id: string; kind: 'choice'; default: string; choices: RoleOptionChoice[]; labelKey: string }

export type RoleDef = {
  id: RoleId
  nameKey: string
  /** Готовое название своей роли: показывается как есть, в словаре его нет. */
  name?: string
  /** Роль создал ведущий. */
  custom?: true
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
  /** Опции роли: экран состава рисует их под строкой включённой роли. */
  options?: RoleOptionDef[]
}

export type NightActionDef = {
  id: string
  order: number
  effect: EffectId
  performers: RoleId[]
  scope: 'team' | 'each'
  /** Блок лидера отменяет командное действие. */
  leader?: RoleId
  /**
   * Блок отменяет действие только при этих значениях опции роли: для командного действия — блок лидера,
   * для одиночного — блок исполнителя. Без поля блок отменяет действие всегда.
   */
  blockCancels?: { option: string; values: string[] }
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
/** closing — доп. речь первых двоих в конце первого круга: идёт внутри шага «Круг речей», длится как обычная речь. */
export type SpeechKind = 'balagan' | 'speech' | 'closing' | 'defense' | 'tiebreak' | 'farewell'
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
  /** random — начинающего выбрало приложение (первый круг), а не ведущий. */
  | Ev<'circle_opened', { first: Seat; random?: true }>
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
/**
 * Правила партии: задаются на экране состава и после раздачи не меняются.
 * В сохранениях до обновления есть только первые два поля — остальные дочитывает normalizeRules.
 */
export type Rules = {
  /** С какого дня выставляют. */
  nominationsFromDay: number
  /** С какого дня есть балаган — если он включён правилом balagan. */
  balaganFromDay: number
  /** Балаган перед кругом речей. Выключен — шага «Балаган» нет ни в один день. */
  balagan: boolean
  /** Выгнанный голосованием говорит прощальное слово. */
  farewellAfterVote: boolean
  /** Выбывший ночью говорит прощальное слово утром. */
  farewellAfterNight: boolean
  /** Блокирующая роль просыпается первой в ночи; иначе — на своём прежнем месте, после мафии. */
  prostituteFirst: boolean
}
export type SessionConfig = {
  playerCount: number
  composition: Record<RoleId, number>
  durations: Durations
  rules: Rules
  separateTimerStart: boolean
  /** Свои роли, которые участвуют в игре: копия на момент раздачи. В старых сохранениях поля нет. */
  customRoles?: CustomRole[]
  /** Значения опций ролей по id опции. Нет поля или ключа — значение по умолчанию из справочника. */
  roleOptions?: Record<string, boolean | string>
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
  /** Правка записи ручного статуса на месте: запись остаётся там же и получает метку «испр.». */
  | { type: 'editStatus'; id: string; status: 'alive' | 'out'; cause?: OutCause }
  // день
  /** random — начинающий выбран случайно: запись журнала помечается «случайно». */
  | { type: 'openCircle'; first: Seat; random?: true }
  /** Завершает идущую речь и начинает новую. */
  | { type: 'startSpeech'; kind: SpeechKind; seat: Seat | null }
  | { type: 'endSpeech' }
  | { type: 'skipSpeaker'; seat: Seat }
  | { type: 'nominate'; by: Seat | null; target: Seat; phase?: PhaseRef }
  | { type: 'removeNomination'; target: Seat; phase?: PhaseRef }
  /** Правка записи выставления: меняется только номер выставленного, место в списке и автор остаются. */
  | { type: 'editNomination'; id: string; target: Seat }
  | { type: 'moveNomination'; target: Seat; toIndex: number }
  | { type: 'setVotes'; ballot: 1 | 2; candidate: Seat; count: number; phase?: PhaseRef }
  | { type: 'setVoters'; ballot: 1 | 2; count: number }
  | { type: 'resetVotes'; ballot: 1 | 2 }
  /** Повторное подтверждение заменяет прежний исход тура вместе с его статусами. phase — правка прошлого дня. */
  | { type: 'resolveVote'; ballot: 1 | 2; outcome: 'eliminated' | 'tie' | 'nobody'; seats: Seat[]; phase?: PhaseRef }
  // ночь
  /** force — записать, несмотря на предупреждение о повторе цели. */
  | { type: 'recordNightAction'; actionId: string; actor: Seat | null; target: Seat | null; phase?: PhaseRef; force?: true }
  | { type: 'confirmNight'; chosen: Seat | null }
  /** Ответ на «итог ночи теперь другой»: apply — исправить статусы, иначе оставить как есть. */
  | { type: 'acknowledgeNight'; night: number; apply: boolean }
  /** Правка итога уже подтверждённой ночи: кто выбыл на самом деле. */
  | { type: 'setNightResult'; night: number; chosen: Seat | null }

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
  /** Начинающего выбрало приложение, а не ведущий. */
  openerRandom: boolean
  previousOpener: Seat | null
  spoken: Seat[]
  skipped: Seat[]
  waiting: Seat[]
  speaking: { kind: SpeechKind; seat: Seat | null; eventId: string } | null
  nominations: Nomination[]
  ballots: Ballot[]
  /** Доп. речь первых двоих: в День 1 — когда в круге высказались все; в остальные дни пусто. */
  closing: SpeechQueue
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
  /** Действие отменено блоком этой ночью: не сработает. */
  blocked: boolean
  /**
   * Кто из исполнителей шага заблокирован этой ночью. Блок не всегда отменяет действие
   * (рядовая мафия при живом лидере, опция «что отменяет блок лидера»), но показать игроку, что он заблокирован, надо.
   */
  blockedActors: Seat[]
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

// ── Журнал для показа ───────────────────────────────────────────────────────

export type JournalEntry = { eventId: string | null; edited: boolean; manual: boolean } & (
  | { kind: 'deal'; counts: Record<RoleId, number> }
  /** numbered — у действия этой ночью несколько исполнителей, в подписи нужен номер. */
  | { kind: 'night_action'; actionId: string; performerRole: RoleId; actor: Seat | null; target: Seat | null; answer?: CheckAnswer; numbered?: true }
  /** Шаг прошлой ночи без записи. */
  | { kind: 'night_missing'; actionId: string; actor: Seat | null; numbered?: true }
  | { kind: 'night_result'; dies: Seat | null; reason: NightOutcome['reason'] }
  | { kind: 'circle'; first: Seat; random?: true }
  | { kind: 'nomination'; index: number; by: Seat | null; target: Seat }
  | { kind: 'votes'; ballot: 1 | 2; voters: number; entries: { candidate: Seat; count: number }[] }
  | { kind: 'vote_result'; ballot: 1 | 2; outcome: VoteOutcome; seats: Seat[] }
  | { kind: 'status'; seat: Seat; status: 'alive' | 'out'; cause?: OutCause }
  | { kind: 'swap'; a: Seat; b: Seat }
  | { kind: 'finish'; winner: SideId | null }
)
export type JournalGroup = { phase: PhaseRef; current: boolean; entries: JournalEntry[] }
