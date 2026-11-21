import { useRef, useState } from 'react'
import type { FC } from 'react'
import { seatList } from '../../app/i18n'
import { useApp, useLang, useStore, useT } from '../../app/StoreContext'
import { Button } from '../common/Button'
import { useHotkeys } from '../common/useHotkeys'
import type { HotkeyMap } from '../common/useHotkeys'
import { toggleTimer } from '../game/dayFlow'
import { DigitKeysContext } from '../game/digitKeys'
import { SUMMARY_STEP } from '../../engine'
import type { GameState, JournalEntry, PhaseRef, Seat } from '../../engine'
import { Header } from '../game/Header'
import type { GameModal } from '../game/Header'
import { JournalPanel } from '../game/JournalPanel'
import { stepLabel } from '../game/labels'
import { MainActionProvider, MainButton, useMainPress } from '../game/MainButton'
import { NightPanel } from '../game/NightPanel'
import { NightSummary } from '../game/NightSummary'
import { PauseCurtain } from '../game/PauseCurtain'
import { PlayerPanel } from '../game/PlayerPanel'
import { AddRecord, isEditable, RecordEditor } from '../game/RecordEditor'
import { SelectionProvider, useSelection } from '../game/selection'
import { SpeechPanel, useNominationNotice } from '../game/SpeechPanel'
import { StepNav } from '../game/StepNav'
import { StopDialog } from '../game/StopDialog'
import { Table } from '../game/Table'
import { TableMarksProvider } from '../game/tableMarks'
import { TimerPanel } from '../game/TimerPanel'
import { TimerSettings } from '../game/TimerSettings'
import { useTimerSignal } from '../game/useTimerSignal'
import { VotePanel } from '../game/VotePanel'
import '../game/game.css'

/** Панель шага. Следующие задачи добавляют панели в карту «шаг → компонент». */
export type StepPanel = FC<{ game: GameState; flash?: boolean }>

const SPEECH_STEPS = ['balagan', 'speeches', 'defense', 'tiebreak', 'farewell']

function panelFor(game: GameState): StepPanel | null {
  if (game.day && game.step !== null && SPEECH_STEPS.includes(game.step)) return SpeechPanel
  if (game.day && (game.step === 'vote' || game.step === 'revote')) return VotePanel
  if (game.night) return game.step === SUMMARY_STEP ? NightSummary : NightPanel
  return null
}

/** Дневные пункты панели игрока: слово вне очереди, пропуск, выставить от имени говорящего, снять. */
function DayActions({ game, seat, onDone }: { game: GameState; seat: Seat; onDone(notice: string | null): void }) {
  const store = useStore()
  const t = useT()
  const noticeFor = useNominationNotice()
  const day = game.day
  if (!day) return null
  const alive = game.players[seat - 1]?.status === 'alive'
  const nominated = day.nominations.some((x) => x.target === seat)
  const speaker = day.speaking?.kind === 'speech' ? day.speaking.seat : null
  return (
    <>
      <Button size="l" disabled={!alive} onClick={() => { store.speak('speech', seat); onDone(null) }}>{t('panel.giveWord')}</Button>
      <Button size="l" disabled={!alive || day.spoken.includes(seat)} onClick={() => { store.dispatch({ type: 'skipSpeaker', seat }); onDone(null) }}>{t('panel.skip')}</Button>
      {day.nominationsOpen && (nominated
        ? <Button size="l" onClick={() => { store.dispatch({ type: 'removeNomination', target: seat }); onDone(null) }}>{t('panel.unnominate')}</Button>
        : (
          <Button size="l" disabled={!alive} onClick={() => {
            const result = store.dispatch({ type: 'nominate', by: speaker, target: seat })
            onDone(result.ok ? null : noticeFor(result.reason, seat))
          }}>{t('panel.nominate')}</Button>
        ))}
    </>
  )
}

function Game({ game }: { game: GameState }) {
  const { session, settings } = useApp()
  const store = useStore()
  const t = useT()
  const lang = useLang()
  const main = useMainPress()
  const [panelSeat, setPanelSeat] = useState<Seat | null>(null)
  const [journalCollapsed, setJournalCollapsed] = useState(false)
  const [modal, setModal] = useState<GameModal>(null)
  const [editing, setEditing] = useState<{ entry: JournalEntry; phase: PhaseRef } | null>(null)
  const [adding, setAdding] = useState<PhaseRef | null>(null)
  const { selection } = useSelection()
  const flash = useTimerSignal()
  const digits = useRef<((n: number) => void) | null>(null)

  const keys: HotkeyMap = {
    space: () => session && toggleTimer(store, session, game),
    enter: main.press,
    undo: () => store.undo(),
    hide: () => store.setSettings({ rolesHidden: !store.getState().settings.rolesHidden }),
    escape: () => {
      if (panelSeat !== null) setPanelSeat(null)
      else if (selection && selection.cancel !== false) selection.onCancel()
    },
  }
  for (let n = 0; n <= 9; n++) keys[`digit${n}`] = () => digits.current?.(n)
  useHotkeys(keys, true)

  if (!session) return null
  const Panel = panelFor(game)
  // Ведущий ушёл дальше через полосу шагов, а круг не закончен или не начат вовсе — предупреждение, не запрет.
  const day = game.day
  const notSpoken = day && game.step !== 'balagan' && game.step !== 'speeches' ? day.waiting : []

  // Итог прошлой ночи разошёлся с отметкой — предложение исправить. Живёт в журнале,
  // а при свёрнутом журнале переезжает в панель шага: ведущий должен его увидеть.
  const nightOffers = game.warnings.flatMap((w) => (w.code === 'night_outcome_changed' ? [w] : [])).map((w) => (
    <div key={w.night} className="journal-warning" role="alert">
      <span>
        {w.expected.length === 0 ? t('warn.night.none', { night: w.night })
          : w.expected.length === 1 ? t('warn.night', { night: w.night, n: w.expected[0] ?? 0 })
          : t('warn.night.many', { night: w.night, seats: seatList(lang, w.expected) })}
      </span>
      <div className="speech-secondary">
        <Button onClick={() => store.dispatch({ type: 'acknowledgeNight', night: w.night, apply: true })}>{t('warn.fix')}</Button>
        <Button variant="outline" onClick={() => store.dispatch({ type: 'acknowledgeNight', night: w.night, apply: false })}>{t('warn.keep')}</Button>
      </div>
    </div>
  ))

  return (
    <>
      <Header game={game} onModal={setModal} />
      <main className={journalCollapsed ? 'game-main game-main-wide' : 'game-main'}>
        <div className="table-wrap">
          <Table game={game} onOpen={setPanelSeat} />
          {panelSeat !== null && (
            <PlayerPanel game={game} seat={panelSeat} onClose={() => setPanelSeat(null)}>
              <DayActions game={game} seat={panelSeat} onDone={() => setPanelSeat(null)} />
            </PlayerPanel>
          )}
        </div>
        <section className="step-panel" aria-label={t('step.panel')}>
          {journalCollapsed && !settings.rolesHidden && nightOffers}
          <StepNav game={game} rules={session.config.rules} />
          {session.timer?.kind === 'free' && Panel !== SpeechPanel && <TimerPanel game={game} flash={flash} />}
          <DigitKeysContext.Provider value={digits}>
            {Panel ? <Panel game={game} flash={flash} /> : <h3 className="step-title">{stepLabel(lang, store.registry, game)}</h3>}
          </DigitKeysContext.Provider>
          {notSpoken.length > 0 && <p className="step-warning">{t('day.notSpoken', { list: notSpoken.join(', ') })}</p>}
          <MainButton main={main} />
        </section>
        <JournalPanel
          session={session} collapsed={journalCollapsed} onCollapse={setJournalCollapsed}
          editable={isEditable} onEntry={(entry, phase) => setEditing({ entry, phase })}
          footer={(group) => group.phase.kind === 'day' && !group.current && (
            <li><button type="button" className="journal-entry journal-add" onClick={() => setAdding(group.phase)}>{t('add.button')}</button></li>
          )}
        >
          {nightOffers}
        </JournalPanel>
      </main>
      {modal === 'stop' && <StopDialog game={game} onClose={() => setModal(null)} />}
      {modal === 'timers' && <TimerSettings onClose={() => setModal(null)} />}
      {editing && <RecordEditor entry={editing.entry} phase={editing.phase} onClose={() => setEditing(null)} />}
      {adding && <AddRecord phase={adding} onClose={() => setAdding(null)} />}
    </>
  )
}

export function GameScreen() {
  const { session, game } = useApp()
  if (!session || !game) return null
  const phase = game.phase?.kind === 'night' ? 'night' : 'day'
  return (
    <div className="game" data-phase={phase}>
      {session.paused
        ? <PauseCurtain game={game} />
        : (
          <SelectionProvider>
            <TableMarksProvider>
              <MainActionProvider>
                <Game game={game} />
              </MainActionProvider>
            </TableMarksProvider>
          </SelectionProvider>
        )}
    </div>
  )
}
