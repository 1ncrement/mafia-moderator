import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { entryText, phaseLabel, plural, roleText } from '../../app/i18n'
import { useApp, useLang, useStore, useT } from '../../app/StoreContext'
import { foulLevel, journal } from '../../engine'
import type { GameState, Seat } from '../../engine'
import { Button } from '../common/Button'
import { Close } from '../common/icons'
import { SideDot } from '../common/SideDot'
import { entryMentions, statusText } from './labels'
import { useAskOnce } from './selection'

type Props = { game: GameState; seat: Seat; onClose(): void; children?: ReactNode }

/** Панель игрока: фолы, ручные статусы, обмен ролями и записи журнала с этим номером. Открывается с карточки в любой фазе. */
export function PlayerPanel({ game, seat, onClose, children }: Props) {
  const { session, settings } = useApp()
  const store = useStore()
  const t = useT()
  const lang = useLang()
  const askOnce = useAskOnce()
  const player = game.players[seat - 1]
  const log = session?.log
  const records = useMemo(() => {
    if (!session) return []
    return journal(session, store.registry).flatMap((group) =>
      group.entries.filter((entry) => entryMentions(entry, seat)).map((entry) => ({ group, entry })))
    // журнал зависит только от событий сессии
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log, seat, store.registry])
  if (!player) return null

  const out = player.status === 'out'
  const setStatus = (status: 'alive' | 'out', cause?: 'shot' | 'voted') => {
    store.dispatch({ type: 'setStatus', seat, status, cause })
    onClose()
  }
  // Фолы: счёт за игру и решение ведущего по последнему достигнутому порогу (каждый третий фол).
  const fouls = game.fouls.counts[seat - 1] ?? 0
  const penalty = game.fouls.penalties.find((p) => p.seat === seat && p.level === foulLevel(fouls))
  // Ближайший день: идущий или тот, что наступит после ночи. Отбытое наказание уже не отменить.
  const today = game.phase?.kind === 'day' ? game.phase.n : game.phase?.kind === 'night' ? game.phase.n + 1 : 1
  const penaltyText = penalty && (penalty.applied
    ? t('panel.penalty.on', { fouls: plural(lang, penalty.level, 'fouls'), phase: phaseLabel(lang, { kind: 'day', n: penalty.day }) })
    : t('panel.penalty.off', { fouls: plural(lang, penalty.level, 'fouls') }))
  const foulAction = (command: 'giveFoul' | 'removeFoul') => {
    store.dispatch({ type: command, seat })
    onClose()
  }
  const decide = (apply: boolean) => {
    store.dispatch({ type: 'decideFoulPenalty', seat, apply })
    onClose()
  }
  const swap = () => {
    onClose()
    askOnce({
      question: t('panel.swap.question', { n: seat }),
      allowed: game.players.map((p) => p.seat).filter((s) => s !== seat),
      onPick: (other) => {
        if (other !== null) store.dispatch({ type: 'swapRoles', a: seat, b: other })
      },
    })
  }

  return (
    <div role="group" aria-label={t('card.player', { n: seat })} className="player-panel">
      <div className="player-panel-head">
        <span className="player-panel-num num">{t('common.seat', { n: seat })}</span>
        <span className="player-panel-who">
          {!settings.rolesHidden && <span className="card-role"><SideDot registry={store.registry} side={player.side} />{roleText(lang, store.registry, player.roleId)}</span>}
          <span className="muted">{statusText(lang, player, settings.rolesHidden) ?? t('status.alive')}</span>
        </span>
        <button type="button" className="icon-btn" aria-label={t('panel.close')} onClick={onClose}><Close /></button>
      </div>
      {/* Фолы — первым блоком: ведущий даёт их на ходу, не отрываясь от стола. Счёт виден и при скрытых ролях. */}
      <div className="player-panel-fouls">
        <span className="player-panel-fouls-count">{t('panel.fouls', { n: fouls })}</span>
        {penaltyText && <span className="small muted">{penaltyText}</span>}
        <div className="player-panel-actions">
          <Button size="l" variant="strong" disabled={out} onClick={() => foulAction('giveFoul')}>{t('panel.foul')}</Button>
          {fouls > 0 && <Button size="l" variant="outline" onClick={() => foulAction('removeFoul')}>{t('panel.foul.remove')}</Button>}
          {penalty?.applied && penalty.day >= today && <Button size="l" variant="outline" onClick={() => decide(false)}>{t('panel.penalty.cancel')}</Button>}
          {penalty && !penalty.applied && !out && <Button size="l" variant="outline" onClick={() => decide(true)}>{t('panel.penalty.apply')}</Button>}
        </div>
      </div>
      <div className="player-panel-actions">
        <Button size="l" disabled={out && player.cause === 'shot'} onClick={() => setStatus('out', 'shot')}>{t('panel.shot')}</Button>
        <Button size="l" disabled={out && player.cause === 'voted'} onClick={() => setStatus('out', 'voted')}>{t('panel.voted')}</Button>
        <Button size="l" disabled={!out} onClick={() => setStatus('alive')}>{t('panel.revive')}</Button>
        {/* Жилет: снять и вернуть вручную. Целый жилет при скрытых ролях не показываем — кнопка назвала бы роль. */}
        {player.vest === 'intact' && !settings.rolesHidden && (
          <Button size="l" onClick={() => { store.dispatch({ type: 'setVest', seat, used: true }); onClose() }}>{t('panel.vest.off')}</Button>
        )}
        {player.vest === 'used' && (
          <Button size="l" onClick={() => { store.dispatch({ type: 'setVest', seat, used: false }); onClose() }}>{t('panel.vest.on')}</Button>
        )}
        {children}
        <Button size="l" variant="outline" onClick={swap}>{t('panel.swap')}</Button>
      </div>
      {!settings.rolesHidden && (
        <div className="player-panel-records">
          <span className="small muted">{t('panel.records')}</span>
          {records.length === 0
            ? <span className="small muted">{t('panel.noRecords')}</span>
            : (
              <ul className="player-panel-list">
                {records.map(({ group, entry }, i) => (
                  <li key={entry.eventId ?? `${i}`}>
                    <span className="muted">{phaseLabel(lang, group.phase)}</span>
                    <span>{entryText(lang, entry, store.registry)}</span>
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </div>
  )
}
