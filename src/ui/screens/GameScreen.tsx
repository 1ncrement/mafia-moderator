import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { FC, RefObject } from 'react'
import { useApp, useLang, useStore, useT } from '../../app/StoreContext'
import { Button } from '../common/Button'
import { Dialog } from '../common/Dialog'
import { useHotkeys } from '../common/useHotkeys'
import type { HotkeyMap } from '../common/useHotkeys'
import { toggleTimer } from '../game/dayFlow'
import type { GameState, Seat } from '../../engine'
import { Header } from '../game/Header'
import type { GameModal } from '../game/Header'
import { JournalPanel } from '../game/JournalPanel'
import { stepLabel } from '../game/labels'
import { MainActionProvider, MainButton, useMainPress } from '../game/MainButton'
import { PauseCurtain } from '../game/PauseCurtain'
import { PlayerPanel } from '../game/PlayerPanel'
import { SelectionProvider, useSelection } from '../game/selection'
import { SpeechPanel, useNominationNotice } from '../game/SpeechPanel'
import { StepNav } from '../game/StepNav'
import { Table } from '../game/Table'
import { TimerPanel } from '../game/TimerPanel'
import { useTimerSignal } from '../game/useTimerSignal'
import '../game/game.css'

/** Панель шага. Следующие задачи добавляют панели в карту «шаг → компонент». */
export type StepPanel = FC<{ game: GameState; flash?: boolean }>

/** Цифровые клавиши отдаются панели шага (ввод голосов): слушатель клавиш на экране один. */
const DigitKeysContext = createContext<RefObject<((n: number) => void) | null> | null>(null)

export function useDigitKeys(handler: ((n: number) => void) | null): void {
  const ref = useContext(DigitKeysContext)
  useEffect(() => {
    if (!ref) return
    ref.current = handler
    return () => {
      ref.current = null
    }
  })
}

const SPEECH_STEPS = ['balagan', 'speeches', 'defense', 'tiebreak', 'farewell']

function panelFor(game: GameState): StepPanel | null {
  if (game.day && game.step !== null && SPEECH_STEPS.includes(game.step)) return SpeechPanel
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
  const { session } = useApp()
  const store = useStore()
  const t = useT()
  const lang = useLang()
  const main = useMainPress()
  const [panelSeat, setPanelSeat] = useState<Seat | null>(null)
  const [journalCollapsed, setJournalCollapsed] = useState(false)
  const [modal, setModal] = useState<GameModal>(null)
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
  // Ведущий ушёл дальше через полосу шагов, а круг не закончен — предупреждение, не запрет.
  const day = game.day
  const notSpoken = day && day.opener !== null && game.step !== 'balagan' && game.step !== 'speeches' ? day.waiting : []

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
          <StepNav game={game} balaganFromDay={session.config.rules.balaganFromDay} />
          {session.timer?.kind === 'free' && Panel !== SpeechPanel && <TimerPanel game={game} flash={flash} />}
          <DigitKeysContext.Provider value={digits}>
            {Panel ? <Panel game={game} flash={flash} /> : <h3 className="step-title">{stepLabel(lang, store.registry, game)}</h3>}
          </DigitKeysContext.Provider>
          {notSpoken.length > 0 && <p className="step-warning">{t('day.notSpoken', { list: notSpoken.join(', ') })}</p>}
          <MainButton main={main} />
        </section>
        <JournalPanel session={session} collapsed={journalCollapsed} onCollapse={setJournalCollapsed} />
      </main>
      {modal === 'stop' && <Dialog title={t('menu.stop')} onClose={() => setModal(null)}>{null}</Dialog>}
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
            <MainActionProvider>
              <Game game={game} />
            </MainActionProvider>
          </SelectionProvider>
        )}
    </div>
  )
}
