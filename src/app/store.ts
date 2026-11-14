import {
  applyPatch, applyUndo, checkComposition, dealRoles, DEFAULT_DURATIONS, DEFAULT_REGISTRY, DEFAULT_RULES,
  defaultComposition, deriveState, execute, journal, newSession, newTimer, timerReduce,
} from '../engine'
import type {
  Command, CommandResult, GameEvent, GameState, RandomInt, Registry, Seat, Session, SessionConfig, SpeechKind,
  TimerAction, UndoEntry,
} from '../engine'
import { createStorage, DEFAULT_SETTINGS } from '../platform/storage'
import type { KV, SessionMeta, Settings } from '../platform/storage'

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
  /** Сырые данные сессии, которую не удалось прочитать, — чтобы ведущий мог их скопировать. */
  rawSession(id: string): string | null
  now(): number
  beep(): void
  randomInt: RandomInt
  registry: Registry
}

const UNDO_LIMIT = 50

export function metaOf(session: Session, registry: Registry = DEFAULT_REGISTRY): SessionMeta {
  const game = deriveState(session, registry)
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
  const registry = env.registry
  const listeners = new Set<() => void>()

  const firstDraft = (): SessionConfig => ({
    playerCount: 10,
    composition: defaultComposition(registry),
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
    return newTimer(speaking.kind, speaking.seat, session.config.durations[speaking.kind] * 1000)
  }

  /** Полная длительность таймера по текущим настройкам сессии: новые длительности действуют со следующего запуска. */
  const rebased = (session: Session, timer: NonNullable<Session['timer']>): NonNullable<Session['timer']> =>
    (timer.kind === 'free' ? timer : { ...timer, durationMs: session.config.durations[timer.kind] * 1000 })

  /** Игры, которые не удалось сохранить: живут в памяти вкладки и остаются в списке на главной. */
  const unsaved = new Map<string, Session>()
  const listSessions = (): SessionMeta[] => [
    ...[...unsaved.values()].map((session) => metaOf(session, registry)),
    ...storage.list().filter((m) => !unsaved.has(m.id)),
  ].sort((a, b) => b.updatedAt - a.updatedAt)

  /**
   * Вывод состояния не должен ронять запуск даже на журнале, который записала не эта версия.
   * Журнал для показа строится тут же: игра, которую нельзя нарисовать, считается нечитаемой.
   */
  const tryDerive = (session: Session): GameState | null => {
    try {
      const game = deriveState(session, registry)
      journal(session, registry)
      return game
    } catch {
      return null
    }
  }

  /** Принять новое состояние сессии: вывести стол, сохранить, сообщить подписчикам. */
  const commit = (session: Session, timer: 'sync' | 'keep' = 'sync') => {
    const game = deriveState(session, registry)
    const next = timer === 'keep' ? session : { ...session, timer: timerFor(session, game, null) }
    const saved = storage.save(next, metaOf(next, registry))
    if (saved) unsaved.delete(next.id)
    else unsaved.set(next.id, next)
    set({ session: next, game, screen: screenOf(game), storageError: !saved })
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
      last = execute({ ...start, log, nextSeq }, cmd, registry)
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

  const store: AppStore = {
    registry,
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

    canUndo: () => (state.session?.undo.length ?? 0) > 0,
    undo() {
      withSession((session) => {
        const entry = session.undo.at(-1)
        if (!entry) return session
        // После отмены таймер шага встаёт в «готов» — и принадлежит тому, кто говорит после отмены.
        const reset = session.timer ? timerReduce(rebased(session, session.timer), { type: 'reset' }, env.now()) : null
        const undone = { ...session, log: applyUndo(session.log, entry), undo: session.undo.slice(0, -1), timer: reset, updatedAt: env.now() }
        return { ...undone, timer: timerFor(undone, deriveState(undone, registry), reset) }
      })
    },

    speak(kind, seat) {
      const result = run([{ type: 'startSpeech', kind, seat }])
      if (!result.ok) return result
      withSession((session) => {
        const fresh = newTimer(kind, seat, session.config.durations[kind] * 1000)
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
        return { ...cleared, timer: timerFor(cleared, deriveState(cleared, registry), null) }
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
      leaveSession({ screen: 'setup', draft: state.settings.lastConfig ?? firstDraft(), brokenSession: null })
    },

    editDraft(patch) {
      set({ draft: { ...state.draft, ...patch } })
    },

    dealDraft() {
      const draft = state.draft
      const check = checkComposition(draft.playerCount, draft.composition, registry)
      if (check.errors.length > 0) return
      const empty = newSession(env.newId(), env.now(), draft)
      const dealt = execute(empty, { type: 'deal', assignment: dealRoles(check.deck, env.randomInt) }, registry)
      if (!dealt.ok) return
      // Сама раздача в стек отмены не входит: отменять её некуда.
      const applied = applyPatch(empty.log, dealt.patch, empty.nextSeq, env.newId)
      const settings = { ...state.settings, lastConfig: draft }
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
      leaveSession({ screen: 'setup', draft: session.config })
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
      leaveSession({ screen: 'setup', draft: session ? session.config : state.draft })
    },

    rawSession(id) {
      const loaded = storage.load(id)
      return loaded && !loaded.ok ? loaded.raw : null
    },
  }

  // Запуск: настройки, список игр и незавершённая игра на том же шаге.
  state = { ...state, settings: storage.settings(), sessions: storage.list() }
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
