import { useState } from 'react'
import type { FC, ReactNode } from 'react'
import { entryText, hasKey, phaseLabel, translateKey } from '../../app/i18n'
import { useApp, useLang, useStore, useT } from '../../app/StoreContext'
import { aliveSeats, currentPhase, dayState, maxVotesFor, nightPlayers, phaseOrder, playersAt } from '../../engine'
import type { Command, CommandResult, JournalEntry, PhaseRef, Seat, Session } from '../../engine'
import type { AppStore } from '../../app/store'
import { Button } from '../common/Button'
import { Dialog } from '../common/Dialog'
import { Stepper } from '../common/Stepper'

/** Какие записи открываются в редакторе. Раздача правится перераздачей и обменом ролей, конец игры — на экране итогов. */
export const isEditable = (entry: JournalEntry): boolean =>
  ['night_action', 'night_missing', 'night_result', 'nomination', 'votes', 'vote_result', 'status', 'circle', 'swap'].includes(entry.kind)

/** Кто был в игре: в текущей фазе — сейчас, в прошлой — на её начало. */
function aliveIn(session: Session, store: AppStore, phase: PhaseRef): Seat[] {
  if (phase.kind === 'night') return aliveSeats(nightPlayers(session, store.registry, phase.n))
  const now = phaseOrder(currentPhase(session.log)) === phaseOrder(phase)
  const players = now ? (store.getState().game?.players ?? []) : playersAt(session, store.registry, phase)
  return aliveSeats(players)
}

/** Сетка номеров: стол на тот момент. Выбывшие тогда — недоступны. */
export function SeatGrid({ total, allowed, picked, onPick, nobody }: {
  /** picked — выбранный номер (null — «никого») или набор номеров (пустой — «никого»). */
  total: number; allowed: Seat[]; picked?: Seat | Seat[] | null; onPick(seat: Seat | null): void
  /** Плитка «никого»: true — «Никого», строка — своя подпись. */
  nobody?: boolean | string
}) {
  const t = useT()
  const isPicked = (seat: Seat) => (Array.isArray(picked) ? picked.includes(seat) : picked === seat)
  const nobodyPicked = Array.isArray(picked) ? picked.length === 0 : picked === null
  return (
    <div className="seat-grid">
      {Array.from({ length: total }, (_, i) => i + 1).map((seat) => (
        <button
          key={seat} type="button" className="seat-btn num" aria-label={t('pick.seat', { n: seat })} aria-pressed={isPicked(seat)}
          disabled={!allowed.includes(seat)} onClick={() => onPick(seat)}
        >
          {seat}
        </button>
      ))}
      {nobody && <button type="button" className="seat-btn seat-btn-wide" aria-pressed={nobodyPicked} onClick={() => onPick(null)}>{typeof nobody === 'string' ? nobody : t('table.nobody')}</button>}
    </div>
  )
}

/**
 * Правка итога прошлой ночи: набор выбывших. Клик по номеру ставит и снимает отметку, «Никто не выбыл» снимает все;
 * статусы меняет только «Сохранить» — одной пачкой.
 */
function NightResultEditor({ total, allowed, initial, onSave }: { total: number; allowed: Seat[]; initial: Seat[]; onSave(died: Seat[]): void }) {
  const t = useT()
  const [died, setDied] = useState<Seat[]>(initial)
  const toggle = (seat: Seat | null) =>
    setDied((list) => (seat === null ? [] : list.includes(seat) ? list.filter((s) => s !== seat) : [...list, seat]))
  return (
    <>
      <p className="dialog-text">{t('edit.nightResult')}</p>
      <SeatGrid total={total} allowed={allowed} picked={died} nobody={t('night.nobody')} onPick={toggle} />
      <div className="dialog-actions"><Button size="l" variant="primary" onClick={() => onSave(died)}>{t('edit.save')}</Button></div>
    </>
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
          onPick={(seat) => seat !== null && run({ type: 'editNomination', id: entry.eventId ?? '', target: seat })}
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
      run({ type: 'editStatus', id: entry.eventId ?? '', status, cause })
    body = (
      <div className="player-panel-actions">
        <Button size="l" disabled={entry.status === 'out' && entry.cause === 'shot'} onClick={() => set('out', 'shot')}>{t('panel.shot')}</Button>
        <Button size="l" disabled={entry.status === 'out' && entry.cause === 'voted'} onClick={() => set('out', 'voted')}>{t('panel.voted')}</Button>
        <Button size="l" disabled={entry.status === 'alive'} onClick={() => set('alive')}>{t('panel.revive')}</Button>
        {remove}
      </div>
    )
  }

  if (entry.kind === 'night_result' && phase.kind === 'night') {
    body = (
      <NightResultEditor
        // Отмеченный итогом остаётся доступным, даже если к подтверждению ночи он уже выбыл вручную: отметку можно снять.
        total={total} allowed={[...new Set([...aliveIn(session, store, phase), ...entry.died])]} initial={entry.died}
        onSave={(died) => run({ type: 'setNightResult', night: phase.n, died })}
      />
    )
  }

  if (entry.kind === 'vote_result') {
    // Выгнанный этим исходом сейчас выбыл, но выбрать его снова можно.
    const allowed = [...new Set([...aliveIn(session, store, phase), ...entry.seats])]
    body = (
      <>
        <p className="dialog-text">{t('edit.vote')}</p>
        <SeatGrid
          total={total} allowed={allowed} picked={entry.outcome === 'eliminated' && entry.seats.length === 1 ? entry.seats[0] : undefined}
          nobody={t('journal.vote.nobody')}
          onPick={(seat) => run({ type: 'resolveVote', ballot: entry.ballot, outcome: seat === null ? 'nobody' : 'eliminated', seats: seat === null ? [] : [seat], phase })}
        />
        <div className="dialog-actions">{remove}</div>
      </>
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
