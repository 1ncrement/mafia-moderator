import { useState } from 'react'
import type { FC, ReactNode } from 'react'
import { entryText, hasKey, phaseLabel, translateKey } from '../../app/i18n'
import { useApp, useLang, useStore, useT } from '../../app/StoreContext'
import { aliveSeats, currentPhase, dayState, maxVotesFor, phaseOrder, playersAt } from '../../engine'
import type { Command, CommandResult, JournalEntry, PhaseRef, Seat, Session } from '../../engine'
import type { AppStore } from '../../app/store'
import { Button } from '../common/Button'
import { Dialog } from '../common/Dialog'
import { Stepper } from '../common/Stepper'

/** Какие записи открываются в редакторе. Исход голосования, итог ночи, раздача и конец игры правятся не здесь. */
export const isEditable = (entry: JournalEntry): boolean =>
  ['night_action', 'night_missing', 'nomination', 'votes', 'status', 'circle', 'swap'].includes(entry.kind)

/** Кто был в игре: в текущей фазе — сейчас, в прошлой — на её начало. */
function aliveIn(session: Session, store: AppStore, phase: PhaseRef): Seat[] {
  const now = phaseOrder(currentPhase(session.log)) === phaseOrder(phase)
  const players = now ? (store.getState().game?.players ?? []) : playersAt(session, store.registry, phase)
  return aliveSeats(players)
}

/** Сетка номеров: стол на тот момент. Выбывшие тогда — недоступны. */
export function SeatGrid({ total, allowed, picked, onPick, nobody }: {
  total: number; allowed: Seat[]; picked?: Seat | null; onPick(seat: Seat | null): void; nobody?: boolean
}) {
  const t = useT()
  return (
    <div className="seat-grid">
      {Array.from({ length: total }, (_, i) => i + 1).map((seat) => (
        <button
          key={seat} type="button" className="seat-btn num" aria-label={t('pick.seat', { n: seat })} aria-pressed={picked === seat}
          disabled={!allowed.includes(seat)} onClick={() => onPick(seat)}
        >
          {seat}
        </button>
      ))}
      {nobody && <button type="button" className="seat-btn seat-btn-wide" aria-pressed={picked === null} onClick={() => onPick(null)}>{t('table.nobody')}</button>}
    </div>
  )
}

function useRejection() {
  const t = useT()
  const lang = useLang()
  const [notice, setNotice] = useState<string | null>(null)
  /** Выполнить команду; отказ движка показать строкой. Возвращает, прошла ли команда. */
  const attempt = (result: CommandResult): boolean => {
    if (result.ok) {
      setNotice(null)
      return true
    }
    const key = `reject.${result.reason}`
    setNotice(hasKey(key) ? translateKey(lang, key) : t('reject.other'))
    return false
  }
  return { notice, attempt }
}

/** Редактор записи журнала: тот же выбор, что был при её создании. Статусы игроков молча не меняются. */
export const RecordEditor: FC<{ entry: JournalEntry; phase: PhaseRef; onClose(): void }> = ({ entry, phase, onClose }) => {
  const { session } = useApp()
  const store = useStore()
  const t = useT()
  const lang = useLang()
  const { notice, attempt } = useRejection()
  const [repeat, setRepeat] = useState<Seat | null>(null)
  if (!session) return null
  const total = session.config.playerCount
  const run = (...cmds: Command[]) => {
    if (attempt(store.dispatchAll(cmds))) onClose()
  }
  const remove = entry.eventId !== null && (
    <Button size="l" variant="outline" onClick={() => run({ type: 'removeEvent', id: entry.eventId ?? '' })}>{t('edit.delete')}</Button>
  )
  let body: ReactNode = <p className="dialog-text">{t('edit.readonly')}</p>

  if (entry.kind === 'night_action' || entry.kind === 'night_missing') {
    const record = (target: Seat | null, force?: true) => {
      const result = store.dispatch({ type: 'recordNightAction', actionId: entry.actionId, actor: entry.actor, target, phase, force })
      if (!result.ok && result.reason === 'repeat_target' && target !== null) return setRepeat(target)
      if (attempt(result)) onClose()
    }
    body = (
      <>
        <p className="dialog-text">{t('edit.night')}</p>
        <SeatGrid total={total} allowed={aliveIn(session, store, phase)} picked={entry.kind === 'night_action' ? entry.target : undefined} nobody onPick={(seat) => record(seat)} />
        {repeat !== null && (
          <div className="night-repeat" role="alert">
            <span>{hasKey(`action.${entry.actionId}.repeat`) ? translateKey(lang, `action.${entry.actionId}.repeat`) : t('night.repeat')}</span>
            <Button variant="strong" onClick={() => record(repeat, true)}>{t('night.force')}</Button>
          </div>
        )}
        {entry.kind === 'night_action' && <div className="dialog-actions">{remove}</div>}
      </>
    )
  }

  if (entry.kind === 'nomination') {
    body = (
      <>
        <p className="dialog-text">{t('edit.nomination')}</p>
        <SeatGrid
          total={total} allowed={aliveIn(session, store, phase).filter((s) => s !== entry.target)} picked={entry.target}
          onPick={(seat) => seat !== null && run({ type: 'removeNomination', target: entry.target, phase }, { type: 'nominate', by: entry.by, target: seat, phase })}
        />
        <div className="dialog-actions">
          <Button size="l" variant="outline" onClick={() => run({ type: 'removeNomination', target: entry.target, phase })}>{t('edit.delete')}</Button>
        </div>
      </>
    )
  }

  if (entry.kind === 'votes' && phase.kind === 'day') {
    const ballot = dayState(session, store.registry, phase.n).ballots.find((b) => b.n === entry.ballot)
    body = (
      <>
        <p className="dialog-text">{t('edit.votes', { n: ballot?.voters ?? entry.voters })}</p>
        <div className="timers-edit">
          {ballot?.entries.map((e) => (
            <div key={e.candidate} className="timers-row">
              <span>{t('common.seat', { n: e.candidate })}</span>
              <Stepper
                value={e.count ?? 0} min={0} max={maxVotesFor(ballot, e.candidate)}
                lessLabel={t('stepper.less', { name: t('common.seat', { n: e.candidate }) })} moreLabel={t('stepper.more', { name: t('common.seat', { n: e.candidate }) })}
                onChange={(count) => attempt(store.dispatch({ type: 'setVotes', ballot: entry.ballot, candidate: e.candidate, count, phase }))}
              />
            </div>
          ))}
        </div>
        <div className="dialog-actions"><Button size="l" variant="primary" onClick={onClose}>{t('common.done')}</Button></div>
      </>
    )
  }

  if (entry.kind === 'status') {
    const set = (status: 'alive' | 'out', cause?: 'shot' | 'voted') =>
      run({ type: 'removeEvent', id: entry.eventId ?? '' }, { type: 'setStatus', seat: entry.seat, status, cause, phase })
    body = (
      <div className="player-panel-actions">
        <Button size="l" disabled={entry.status === 'out' && entry.cause === 'shot'} onClick={() => set('out', 'shot')}>{t('panel.shot')}</Button>
        <Button size="l" disabled={entry.status === 'out' && entry.cause === 'voted'} onClick={() => set('out', 'voted')}>{t('panel.voted')}</Button>
        <Button size="l" disabled={entry.status === 'alive'} onClick={() => set('alive')}>{t('panel.revive')}</Button>
        {remove}
      </div>
    )
  }

  if (entry.kind === 'circle' || entry.kind === 'swap') body = <div className="dialog-actions">{remove}</div>

  return (
    <Dialog title={t('edit.title', { phase: phaseLabel(lang, phase) })} onClose={onClose}>
      <p className="edit-record"><span className="small muted">{t('edit.record')}</span>{entryText(lang, entry, store.registry)}</p>
      {body}
      {notice && <p className="alert-line" role="alert">{notice}</p>}
    </Dialog>
  )
}

/** «Добавить запись…» в прошлый день: выставление или смена статуса задним числом. */
export function AddRecord({ phase, onClose }: { phase: PhaseRef; onClose(): void }) {
  const { session } = useApp()
  const store = useStore()
  const t = useT()
  const lang = useLang()
  const { notice, attempt } = useRejection()
  const [mode, setMode] = useState<'nominate' | 'status'>('nominate')
  const [seat, setSeat] = useState<Seat | null>(null)
  if (!session) return null
  const total = session.config.playerCount
  const all = Array.from({ length: total }, (_, i) => i + 1)
  const run = (cmd: Command) => {
    if (attempt(store.dispatch(cmd))) onClose()
  }

  return (
    <Dialog title={t('add.title', { phase: phaseLabel(lang, phase) })} onClose={onClose}>
      <div className="lang add-mode">
        {(['nominate', 'status'] as const).map((m) => (
          <button key={m} type="button" className="lang-btn" aria-pressed={mode === m} onClick={() => { setMode(m); setSeat(null) }}>{t(`add.${m}`)}</button>
        ))}
      </div>
      <p className="dialog-text">{t(`add.${mode}.hint`)}</p>
      {mode === 'nominate'
        ? <SeatGrid total={total} allowed={aliveIn(session, store, phase)} onPick={(target) => target !== null && run({ type: 'nominate', by: null, target, phase })} />
        : (
          <>
            <SeatGrid total={total} allowed={all} picked={seat} onPick={setSeat} />
            <div className="player-panel-actions">
              <Button size="l" disabled={seat === null} onClick={() => seat !== null && run({ type: 'setStatus', seat, status: 'out', cause: 'shot', phase })}>{t('panel.shot')}</Button>
              <Button size="l" disabled={seat === null} onClick={() => seat !== null && run({ type: 'setStatus', seat, status: 'out', cause: 'voted', phase })}>{t('panel.voted')}</Button>
              <Button size="l" disabled={seat === null} onClick={() => seat !== null && run({ type: 'setStatus', seat, status: 'alive', phase })}>{t('panel.revive')}</Button>
            </div>
          </>
        )}
      {notice && <p className="alert-line" role="alert">{notice}</p>}
    </Dialog>
  )
}
