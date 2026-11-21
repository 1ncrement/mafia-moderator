import {
  aliveSeats, applyPatch, applyUndo, checkComposition, dealRoles, DEFAULT_DURATIONS, DEFAULT_REGISTRY, DEFAULT_RULES,
  defaultComposition, deriveState, execute, journal, MAX_CUSTOM_ROLES, newSession, newTimer, registryFor, samePhase, sanitizeCustomRoles,
  speechSeconds, timerReduce,
} from '../engine'
import type {
  Command, CommandResult, CustomRole, GameEvent, GameState, RandomInt, Registry, RoleId, Seat, Session, SessionConfig, SpeechKind,
  TimerAction, UndoEntry,
} from '../engine'
import { createStorage, DEFAULT_SETTINGS } from '../platform/storage'
import type { KV, SessionMeta, Settings } from '../platform/storage'
import { checkRoleName, cleanRoleName, takenNames } from './customRoles'
import type { RoleInput, RoleIssue } from './customRoles'

// Состояние приложения: один маленький store без библиотек. Журнал сессии — источник истины,
// состояние стола каждый раз выводит deriveState. Сохранение — после каждой команды, синхронно.

export type { KV, Lang, SessionMeta, Settings } from '../platform/storage'

export type Screen = 'home' | 'setup' | 'deal' | 'game' | 'summary'
export type Env = {
  kv: KV
  now: () => number
  newId: () => string
  randomInt: RandomInt
  registry: Registry
  /** Один звуковой сигнал по нулю таймера. */
  beep: () => void
  /** Просить браузер не гасить экран, пока идёт игра. */
  keepAwake: (active: boolean) => void
}
export type AppState = {
  screen: Screen
  session: Session | null
  game: GameState | null
  settings: Settings
  /** Черновик состава на экране «Состав». */
  draft: SessionConfig
  sessions: SessionMeta[]
  /** Последнее сохранение не удалось: игра идёт только в памяти этой вкладки. */
  storageError: boolean
  /** id сессии, которую не удалось прочитать. */
  brokenSession: string | null
}
export type AppStore = {
  getState(): AppState
  subscribe(fn: () => void): () => void
  dispatch(cmd: Command): CommandResult
  /** Несколько команд одной кнопки: применяются все или ни одна, отменяются одним нажатием. */
  dispatchAll(cmds: Command[]): CommandResult
  /** Начало Дня 1: начинающего первый круг выбирает случай. Начало дня и выбор — одна пачка, отменяются вместе. */
  startFirstDay(): CommandResult
  undo(): void
  canUndo(): boolean
  /** startSpeech + таймер нужной длительности. */
  speak(kind: SpeechKind, seat: Seat | null): CommandResult
  timer(action: TimerAction): void
  freeTimer(seconds: number): void
  clearTimer(): void
  /** Правка настроек идущей игры (длительности, запуск таймера отдельной кнопкой). */
  updateConfig(patch: Partial<SessionConfig>): void
  setPaused(paused: boolean): void
  setSettings(patch: Partial<Settings>): void
  newGame(): void
  editDraft(patch: Partial<SessionConfig>): void
  dealDraft(): void
  backToSetup(): void
  openSession(id: string): void
  deleteSession(id: string): void
  goHome(): void
  rematch(): void
  /** Новая своя роль: попадает в перечень и сразу в состав с количеством 1. null — добавлена. */
  addCustomRole(input: RoleInput): RoleIssue | null
  updateCustomRole(id: RoleId, input: RoleInput): RoleIssue | null
  /** Убирает роль из перечня и из черновика состава. Игры, в которых она участвовала, хранят свою копию. */
  removeCustomRole(id: RoleId): void
  /** Сырые данные сессии, которую не удалось прочитать, — чтобы ведущий мог их скопировать. */
  rawSession(id: string): string | null
  now(): number
  beep(): void
  randomInt: RandomInt
  /** Справочник идущей сессии; без сессии — встроенный справочник плюс перечень своих ролей из настроек, порядок ночи — по правилам черновика. */
  readonly registry: Registry
}

const UNDO_LIMIT = 50

/** Справочник сессии: встроенный плюс свои роли, которые она запомнила при раздаче; порядок ночи — по её правилам партии. */
const sessionRegistry = (base: Registry, session: Session): Registry => registryFor(base, session.config.customRoles, session.config.rules)

export function metaOf(session: Session, base: Registry = DEFAULT_REGISTRY): SessionMeta {
  const game = deriveState(session, sessionRegistry(base, session))
  const phase = game.phase ?? { kind: 'deal' }
  return {
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    status: game.finished ? 'finished' : phase.kind === 'deal' ? 'deal' : 'running',
    playerCount: session.config.playerCount,
    alive: game.counts.alive,
    phase,
    winner: game.finished?.winner ?? null,
  }
}

function screenOf(game: GameState): Screen {
  if (game.finished) return 'summary'
  return game.phase === null || game.phase.kind === 'deal' ? 'deal' : 'game'
}

/** Запись отмены как разница двух журналов: годится для любой последовательности пачек. */
function diffLogs(before: GameEvent[], after: GameEvent[]): UndoEntry {
  const was = new Map(before.map((e) => [e.id, e]))
  const now = new Map(after.map((e) => [e.id, e]))
  return {
    added: after.filter((e) => !was.has(e.id)).map((e) => e.id),
    replaced: before.filter((e) => now.has(e.id) && now.get(e.id) !== e),
    removed: before.filter((e) => !now.has(e.id)),
  }
}

export function createAppStore(env: Env): AppStore {
  const storage = createStorage(env.kv)
  const base = env.registry
  const regOf = (session: Session): Registry => sessionRegistry(base, session)
  const listeners = new Set<() => void>()

  const firstDraft = (): SessionConfig => ({
    playerCount: 10,
    composition: defaultComposition(base),
    durations: DEFAULT_DURATIONS,
    rules: DEFAULT_RULES,
    separateTimerStart: false,
  })

  let state: AppState = {
    screen: 'home', session: null, game: null, settings: DEFAULT_SETTINGS, draft: firstDraft(),
    sessions: [], storageError: false, brokenSession: null,
  }

  /** Экран удерживается, пока открыт игровой экран и игра не на паузе. */
  let awake = false
  const syncAwake = () => {
    const want = state.screen === 'game' && state.session !== null && !state.session.paused
    if (want !== awake) {
      awake = want
      env.keepAwake(want)
    }
  }

  const set = (patch: Partial<AppState>) => {
    state = { ...state, ...patch }
    syncAwake()
    for (const fn of listeners) fn()
  }

  /**
   * Таймер, который должен быть у сессии. Свободный остаётся как есть. У идущей речи — её таймер;
   * если говорящий есть, а таймера для него нет (отмена, закрыт свободный таймер) — таймер этой речи в «готов».
   * Никто не говорит — idle.
   */
  const timerFor = (session: Session, game: GameState, idle: Session['timer']): Session['timer'] => {
    const timer = session.timer
    if (timer?.kind === 'free') return timer
    const speaking = game.day?.speaking
    if (!speaking) return idle
    if (timer && timer.kind === speaking.kind && timer.seat === speaking.seat) return timer
    return newTimer(speaking.kind, speaking.seat, speechSeconds(session.config.durations, speaking.kind) * 1000)
  }

  /** Полная длительность таймера по текущим настройкам сессии: новые длительности действуют со следующего запуска. */
  const rebased = (session: Session, timer: NonNullable<Session['timer']>): NonNullable<Session['timer']> =>
    (timer.kind === 'free' ? timer : { ...timer, durationMs: speechSeconds(session.config.durations, timer.kind) * 1000 })

  /** Игры, которые не удалось сохранить: живут в памяти вкладки и остаются в списке на главной. */
  const unsaved = new Map<string, Session>()
  const listSessions = (): SessionMeta[] => [
    ...[...unsaved.values()].map((session) => metaOf(session, base)),
    ...storage.list().filter((m) => !unsaved.has(m.id)),
  ].sort((a, b) => b.updatedAt - a.updatedAt)

  /**
   * Вывод состояния не должен ронять запуск даже на журнале, который записала не эта версия.
   * Журнал для показа строится тут же: игра, которую нельзя нарисовать, считается нечитаемой.
   */
  const tryDerive = (session: Session): GameState | null => {
    try {
      const game = deriveState(session, regOf(session))
      journal(session, regOf(session))
      return game
    } catch {
      return null
    }
  }

  /**
   * Видимость ролей по фазе: в начале дня роли скрываются, в начале ночи открываются — и при отмене перехода тоже,
   * по фазе, в которую вернулись. Внутри фазы видимостью управляет ведущий. Распределение правило не трогает:
   * сами роли там не открываются. null — фаза не сменилась, настройку не трогаем.
   */
  const hiddenAfter = (session: Session, game: GameState): boolean | null => {
    const before = state.session?.id === session.id ? state.game?.phase : null
    const after = game.phase
    if (!before || !after || samePhase(before, after) || after.kind === 'deal') return null
    return after.kind === 'day'
  }

  /** Принять новое состояние сессии: вывести стол, сохранить, сообщить подписчикам. */
  const commit = (session: Session, timer: 'sync' | 'keep' = 'sync') => {
    const game = deriveState(session, regOf(session))
    const next = timer === 'keep' ? session : { ...session, timer: timerFor(session, game, null) }
    const saved = storage.save(next, metaOf(next, base))
    if (saved) unsaved.delete(next.id)
    else unsaved.set(next.id, next)
    const rolesHidden = hiddenAfter(session, game)
    const settings = rolesHidden === null || rolesHidden === state.settings.rolesHidden ? state.settings : { ...state.settings, rolesHidden }
    if (settings !== state.settings) storage.saveSettings(settings)
    set({ session: next, game, screen: screenOf(game), storageError: !saved, settings })
  }

  const leaveSession = (patch: Partial<AppState>) => {
    storage.setActiveId(null)
    set({ session: null, game: null, sessions: listSessions(), ...patch })
  }

  const run = (cmds: Command[]): CommandResult => {
    const start = state.session
    if (!start) return { ok: false, reason: 'wrong_phase' }
    let log = start.log
    let nextSeq = start.nextSeq
    let last: CommandResult = { ok: true, patch: { add: [], replace: [], remove: [] } }
    for (const cmd of cmds) {
      last = execute({ ...start, log, nextSeq }, cmd, regOf(start))
      if (!last.ok) return last
      const applied = applyPatch(log, last.patch, nextSeq, env.newId)
      log = applied.log
      nextSeq = applied.nextSeq
    }
    const entry = diffLogs(start.log, log)
    // Команда без изменений в стек отмены не попадает.
    if (entry.added.length + entry.replaced.length + entry.removed.length === 0) return last
    // Остановка и возобновление игры — не игровые действия: у них свои кнопки на итогах, в стек отмены они не идут.
    const outsideUndo = cmds.every((cmd) => cmd.type === 'finishGame' || cmd.type === 'resumeGame')
    const undo = outsideUndo ? start.undo : [...start.undo, entry].slice(-UNDO_LIMIT)
    commit({ ...start, log, nextSeq, undo, updatedAt: env.now() })
    return last
  }

  const withSession = (fn: (session: Session) => Session) => {
    if (state.session) commit(fn(state.session), 'keep')
  }

  /** Перечень своих ролей меняется только здесь: сразу в настройки браузера. */
  const saveRoles = (customRoles: CustomRole[]) => {
    const settings = { ...state.settings, customRoles }
    storage.saveSettings(settings)
    set({ settings })
  }

  /**
   * Состав прошлой игры как черновик новой: её свои роли, которых в перечне уже нет, возвращаются в перечень
   * (пока не достигнут предел). Если в перечне успели завести роль с тем же названием, двойник не создаётся —
   * количество переходит к роли перечня.
   */
  const adoptRoles = (config: SessionConfig): SessionConfig => {
    const list = [...state.settings.customRoles]
    const composition = { ...config.composition }
    for (const role of sanitizeCustomRoles(base, config.customRoles)) {
      if (list.some((r) => r.id === role.id)) continue
      const twin = list.find((r) => r.name.toLowerCase() === role.name.toLowerCase())
      if (twin) {
        composition[twin.id] = (composition[twin.id] ?? 0) + (composition[role.id] ?? 0)
        delete composition[role.id]
      } else if (list.length < MAX_CUSTOM_ROLES) {
        list.push(role)
      }
    }
    if (list.length !== state.settings.customRoles.length) saveRoles(list)
    // Черновик состава своих ролей не хранит: их перечень — в настройках, копию для игры делает раздача.
    const draft: SessionConfig = { ...config, composition }
    delete draft.customRoles
    return draft
  }

  const store: AppStore = {
    get registry() {
      return state.session ? regOf(state.session) : registryFor(base, state.settings.customRoles, state.draft.rules)
    },
    now: env.now,
    beep: env.beep,
    randomInt: env.randomInt,
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },

    dispatch: (cmd) => run([cmd]),
    dispatchAll: (cmds) => run(cmds),

    startFirstDay() {
      const game = state.game
      if (!game || game.phase?.kind !== 'deal') return { ok: false, reason: 'wrong_phase' }
      const start: Command = { type: 'startPhase', phase: { kind: 'day', n: 1 } }
      // Случайность живёт здесь, а не в движке: команда получает уже выбранный номер.
      const alive = aliveSeats(game.players)
      const first = alive[env.randomInt(alive.length)] ?? alive[0]
      return run(first === undefined ? [start] : [start, { type: 'openCircle', first, random: true }])
    },

    canUndo: () => (state.session?.undo.length ?? 0) > 0,
    undo() {
      withSession((session) => {
        const entry = session.undo.at(-1)
        if (!entry) return session
        // После отмены таймер шага встаёт в «готов» — и принадлежит тому, кто говорит после отмены.
        const reset = session.timer ? timerReduce(rebased(session, session.timer), { type: 'reset' }, env.now()) : null
        const undone = { ...session, log: applyUndo(session.log, entry), undo: session.undo.slice(0, -1), timer: reset, updatedAt: env.now() }
        return { ...undone, timer: timerFor(undone, deriveState(undone, regOf(undone)), reset) }
      })
    },

    speak(kind, seat) {
      const result = run([{ type: 'startSpeech', kind, seat }])
      if (!result.ok) return result
      withSession((session) => {
        const fresh = newTimer(kind, seat, speechSeconds(session.config.durations, kind) * 1000)
        return { ...session, timer: session.config.separateTimerStart ? fresh : timerReduce(fresh, { type: 'start' }, env.now()) }
      })
      return result
    },

    timer(action) {
      withSession((session) => {
        if (!session.timer) return session
        // «Заново» возвращает полную длительность из настроек, а не ту, с которой таймер был создан.
        const timer = action.type === 'reset' ? rebased(session, session.timer) : session.timer
        return { ...session, timer: timerReduce(timer, action, env.now()) }
      })
    },

    freeTimer(seconds) {
      withSession((session) => ({ ...session, timer: timerReduce(newTimer('free', null, seconds * 1000), { type: 'start' }, env.now()) }))
    },

    clearTimer() {
      // Закрыли свободный таймер посреди речи — говорящий получает свой таймер обратно, в «готов».
      withSession((session) => {
        const cleared = { ...session, timer: null }
        return { ...cleared, timer: timerFor(cleared, deriveState(cleared, regOf(cleared)), null) }
      })
    },

    updateConfig(patch) {
      withSession((session) => {
        const next = { ...session, config: { ...session.config, ...patch } }
        const timer = next.timer
        // Таймер, который ещё не запущен, сразу получает новую длительность (добавленные «+10 с» остаются).
        if (!timer || timer.status !== 'ready') return next
        const fresh = rebased(next, timer)
        return { ...next, timer: { ...fresh, remainingMs: fresh.durationMs + (timer.remainingMs - timer.durationMs) } }
      })
    },

    setPaused(paused) {
      withSession((session) => ({
        ...session,
        paused,
        // Пауза игры останавливает таймер; снятие паузы его не запускает.
        timer: paused && session.timer ? timerReduce(session.timer, { type: 'pause' }, env.now()) : session.timer,
      }))
    },

    setSettings(patch) {
      const settings = { ...state.settings, ...patch }
      storage.saveSettings(settings)
      set({ settings })
    },

    newGame() {
      const draft = state.settings.lastConfig ?? firstDraft()
      // Своя роль, которой не было ни в одном розданном составе, — новая: она включена с количеством 1,
      // даже если ведущий добавил её и ушёл на главную. Роль из прошлого состава сохраняет своё количество, в том числе 0.
      const composition = { ...draft.composition }
      for (const role of state.settings.customRoles) if (composition[role.id] === undefined) composition[role.id] = 1
      leaveSession({ screen: 'setup', draft: { ...draft, composition }, brokenSession: null })
    },

    editDraft(patch) {
      set({ draft: { ...state.draft, ...patch } })
    },

    dealDraft() {
      const draft = state.draft
      const check = checkComposition(draft.playerCount, draft.composition, registryFor(base, state.settings.customRoles))
      if (check.errors.length > 0) return
      // Игра запоминает свои роли, которые в ней участвуют: потом их можно переименовать или удалить из перечня.
      const customRoles = state.settings.customRoles.filter((role) => check.deck.includes(role.id))
      const empty = newSession(env.newId(), env.now(), { ...draft, customRoles })
      const dealt = execute(empty, { type: 'deal', assignment: dealRoles(check.deck, env.randomInt) }, regOf(empty))
      if (!dealt.ok) return
      // Сама раздача в стек отмены не входит: отменять её некуда.
      const applied = applyPatch(empty.log, dealt.patch, empty.nextSeq, env.newId)
      // Последний состав помнит и роли перечня, которых в нём нет: у них явный 0. Без ключа остаётся
      // только роль, появившаяся после этой раздачи, — её «Новая игра» и включает как новую.
      const known = { ...draft.composition }
      for (const role of state.settings.customRoles) known[role.id] ??= 0
      const settings = { ...state.settings, lastConfig: { ...draft, composition: known } }
      storage.saveSettings(settings)
      storage.setActiveId(empty.id)
      set({ settings })
      commit({ ...empty, log: applied.log, nextSeq: applied.nextSeq })
    },

    backToSetup() {
      const session = state.session
      if (!session) return
      // Раздача, по которой игру не начали, не нужна в списке игр.
      storage.remove(session.id)
      unsaved.delete(session.id)
      leaveSession({ screen: 'setup', draft: adoptRoles(session.config) })
    },

    openSession(id) {
      const memory = unsaved.get(id)
      const loaded = memory ? { ok: true as const, session: memory } : storage.load(id)
      if (loaded === null) return leaveSession({ screen: 'home' })
      const game = loaded.ok ? tryDerive(loaded.session) : null
      if (!loaded.ok || !game) return leaveSession({ screen: 'home', brokenSession: id })
      storage.setActiveId(id)
      set({ session: loaded.session, game, screen: screenOf(game), brokenSession: null })
    },

    deleteSession(id) {
      storage.remove(id)
      unsaved.delete(id)
      if (state.session?.id === id) leaveSession({ screen: 'home' })
      else set({ sessions: listSessions(), brokenSession: state.brokenSession === id ? null : state.brokenSession })
    },

    goHome() {
      leaveSession({ screen: 'home' })
    },

    rematch() {
      const session = state.session
      leaveSession({ screen: 'setup', draft: session ? adoptRoles(session.config) : state.draft })
    },

    addCustomRole(input) {
      const list = state.settings.customRoles
      if (list.length >= MAX_CUSTOM_ROLES) return 'limit'
      const issue = checkRoleName(input.name, takenNames(base, list))
      if (issue) return issue
      // Идентификатор от названия не зависит: переименование ничего не ломает.
      let id: RoleId
      do id = `custom_${env.newId()}`
      while (list.some((r) => r.id === id))
      saveRoles([...list, { id, name: cleanRoleName(input.name), side: input.side, night: input.night }])
      set({ draft: { ...state.draft, composition: { ...state.draft.composition, [id]: 1 } } })
      return null
    },

    updateCustomRole(id, input) {
      const list = state.settings.customRoles
      const current = list.find((r) => r.id === id)
      if (!current) return null
      // Роль, заведённая раньше, может носить название, которое потом заняла встроенная («Журналист»):
      // пока название не меняют, правка разрешена.
      const sameName = cleanRoleName(input.name).toLowerCase() === current.name.toLowerCase()
      const issue = sameName ? null : checkRoleName(input.name, takenNames(base, list, id))
      if (issue) return issue
      saveRoles(list.map((r) => (r.id === id ? { id, name: cleanRoleName(input.name), side: input.side, night: input.night } : r)))
      return null
    },

    removeCustomRole(id) {
      saveRoles(state.settings.customRoles.filter((r) => r.id !== id))
      const composition = { ...state.draft.composition }
      delete composition[id]
      set({ draft: { ...state.draft, composition } })
    },

    rawSession(id) {
      const loaded = storage.load(id)
      return loaded && !loaded.ok ? loaded.raw : null
    },
  }

  // Запуск: настройки, список игр и незавершённая игра на том же шаге.
  const stored = storage.settings()
  // Негодные записи перечня своих ролей пропускаются: повреждённый перечень не роняет запуск.
  state = { ...state, settings: { ...stored, customRoles: sanitizeCustomRoles(base, stored.customRoles) }, sessions: storage.list() }
  const active = storage.activeId()
  if (active !== null) {
    const loaded = storage.load(active)
    const game = loaded?.ok ? tryDerive(loaded.session) : null
    if (loaded?.ok && game) state = { ...state, session: loaded.session, game, screen: screenOf(game) }
    else if (loaded) state = { ...state, brokenSession: active }
  }
  syncAwake()

  return store
}
