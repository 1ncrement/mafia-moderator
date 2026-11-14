import { useStore, useT } from '../../app/StoreContext'
import type { DayState, GameState } from '../../engine'
import { Button } from '../common/Button'
import { Close, Down, Up } from '../common/icons'
import { aliveOf } from './dayFlow'
import { useAskOnce } from './selection'

/** Лента выставленных: порядок и автор. Можно снять, добавить вручную и переставить. */
export function NominationList({ game, day }: { game: GameState; day: DayState }) {
  const store = useStore()
  const t = useT()
  const askOnce = useAskOnce()
  const list = day.nominations

  const add = () => askOnce({
    question: t('day.nominated.add.question'),
    allowed: aliveOf(game).filter((seat) => !list.some((x) => x.target === seat)),
    onPick: (seat) => {
      if (seat !== null) store.dispatch({ type: 'nominate', by: null, target: seat })
    },
  })

  return (
    <div className="nominations">
      <span className="small muted">{t('day.nominated.title')}</span>
      {list.length === 0 && <span className="muted">{t('day.nominated.none')}</span>}
      <ol className="nominations-list">
        {list.map((x, i) => (
          <li key={x.eventId} className={x.active ? 'nomination' : 'nomination nomination-out'}>
            <span className="nomination-index num">{i + 1}</span>
            <span className="nomination-seat">{t('common.seat', { n: x.target })}</span>
            <span className="nomination-by">
              {x.by === null ? t('day.nominated.manual') : t('day.nominated.by', { n: x.by })}{!x.active && ` · ${t('day.nominated.out')}`}
            </span>
            <button type="button" className="icon-btn" aria-label={t('day.nominated.up', { n: x.target })} disabled={i === 0}
              onClick={() => store.dispatch({ type: 'moveNomination', target: x.target, toIndex: i - 1 })}><Up /></button>
            <button type="button" className="icon-btn" aria-label={t('day.nominated.down', { n: x.target })} disabled={i === list.length - 1}
              onClick={() => store.dispatch({ type: 'moveNomination', target: x.target, toIndex: i + 1 })}><Down /></button>
            <button type="button" className="icon-btn" aria-label={t('day.nominated.remove', { n: x.target })}
              onClick={() => store.dispatch({ type: 'removeNomination', target: x.target })}><Close /></button>
          </li>
        ))}
      </ol>
      <Button variant="ghost" className="nominations-add" onClick={add}>{t('day.nominated.add')}</Button>
    </div>
  )
}
