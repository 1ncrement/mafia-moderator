import { useState } from 'react'
import type { FC } from 'react'
import { useApp, useLang, useStore, useT } from '../../app/StoreContext'
import type { GameState, Seat } from '../../engine'
import { Header } from '../game/Header'
import type { GameModal } from '../game/Header'
import { JournalPanel } from '../game/JournalPanel'
import { stepLabel } from '../game/labels'
import { MainActionProvider, MainButton, useMainPress } from '../game/MainButton'
import { PauseCurtain } from '../game/PauseCurtain'
import { PlayerPanel } from '../game/PlayerPanel'
import { SelectionProvider } from '../game/selection'
import { StepNav } from '../game/StepNav'
import { Table } from '../game/Table'
import '../game/game.css'

/** Панель шага. Следующие задачи добавляют панели в карту «шаг → компонент». */
export type StepPanel = FC<{ game: GameState }>

function panelFor(_game: GameState): StepPanel | null {
  return null
}

function Game({ game }: { game: GameState }) {
  const { session } = useApp()
  const store = useStore()
  const t = useT()
  const lang = useLang()
  const main = useMainPress()
  const [panelSeat, setPanelSeat] = useState<Seat | null>(null)
  const [journalCollapsed, setJournalCollapsed] = useState(false)
  const [, setModal] = useState<GameModal>(null)
  if (!session) return null
  const Panel = panelFor(game)

  return (
    <>
      <Header game={game} onModal={setModal} />
      <main className={journalCollapsed ? 'game-main game-main-wide' : 'game-main'}>
        <div className="table-wrap">
          <Table game={game} onOpen={setPanelSeat} />
          {panelSeat !== null && <PlayerPanel game={game} seat={panelSeat} onClose={() => setPanelSeat(null)} />}
        </div>
        <section className="step-panel" aria-label={t('step.panel')}>
          <StepNav game={game} balaganFromDay={session.config.rules.balaganFromDay} />
          {Panel ? <Panel game={game} /> : <h3 className="step-title">{stepLabel(lang, store.registry, game)}</h3>}
          <MainButton main={main} />
        </section>
        <JournalPanel session={session} collapsed={journalCollapsed} onCollapse={setJournalCollapsed} />
      </main>
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
