import {
  applyPatch, applyUndo, checkComposition, dealRoles, DEFAULT_DURATIONS, DEFAULT_REGISTRY, DEFAULT_RULES,
  defaultComposition, deriveState, execute, newSession, newTimer, timerReduce,
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

  /** Таймер речи живёт, пока идёт эта речь: выбыл говорящий, сменилась фаза — таймер снимается. */
  const timerFor = (session: Session, game: GameState): Session['timer'] => {
    const timer = session.timer
    if (!timer || timer.kind === 'free') return timer
    const speaking = game.day?.speaking
    return speaking && speaking.kind === timer.kind && speaking.seat === timer.seat ? timer : null
  }

  /** Принять новое состояние сессии: вывести стол, сохранить, сообщить подписчикам. */
  const commit = (session: Session, opts: { keepTimer?: boolean } = {}) => {
    const game = deriveState(session, registry)
    const next = opts.keepTimer ? session : { ...session, timer: timerFor(session, game) }
    const saved = storage.save(next, metaOf(next, registry))
    set({ session: next, game, screen: screenOf(game), storageError: !saved })
  }

  const leaveSession = (patch: Partial<AppState>) => {
    storage.setActiveId(null)
    set({ session: null, game: null, sessions: storage.list(), ...patch })
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
    commit({ ...start, log, nextSeq, undo: [...start.undo, entry].slice(-UNDO_LIMIT), updatedAt: env.now() })
    return last
  }

  const withSession = (fn: (session: Session) => Session, keepTimer = true) => {
    if (state.session) commit(fn(state.session), { keepTimer })
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
        return {
          ...session,
          log: applyUndo(session.log, entry),
          undo: session.undo.slice(0, -1),
          // После отмены таймер шага встаёт в «готов».
          timer: session.timer ? timerReduce(session.timer, { type: 'reset' }, env.now()) : null,
          updatedAt: env.now(),
        }
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
      withSession((session) => (session.timer ? { ...session, timer: timerReduce(session.timer, action, env.now()) } : session))
    },

    freeTimer(seconds) {
      withSession((session) => ({ ...session, timer: timerReduce(newTimer('free', null, seconds * 1000), { type: 'start' }, env.now()) }))
    },

    clearTimer() {
      withSession((session) => ({ ...session, timer: null }))
    },

    updateConfig(patch) {
      withSession((session) => ({ ...session, config: { ...session.config, ...patch } }))
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
      leaveSession({ screen: 'setup', draft: session.config })
    },

    openSession(id) {
      const loaded = storage.load(id)
      if (loaded === null) return leaveSession({ screen: 'home' })
      if (!loaded.ok) return leaveSession({ screen: 'home', brokenSession: id })
      storage.setActiveId(id)
      const game = deriveState(loaded.session, registry)
      set({ session: loaded.session, game, screen: screenOf(game), brokenSession: null })
    },

    deleteSession(id) {
      storage.remove(id)
      if (state.session?.id === id) leaveSession({ screen: 'home' })
      else set({ sessions: storage.list(), brokenSession: state.brokenSession === id ? null : state.brokenSession })
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
    if (loaded?.ok) {
      const game = deriveState(loaded.session, registry)
      state = { ...state, session: loaded.session, game, screen: screenOf(game) }
    } else if (loaded) {
      state = { ...state, brokenSession: active }
    }
  }
  syncAwake()

  return store
}
