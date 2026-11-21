import { roleText } from '../../app/i18n'
import { useLang, useT } from '../../app/StoreContext'
import type { PlayerView, Registry } from '../../engine'
import { cx } from '../common/Button'
import { Dots } from '../common/icons'
import { SideDot } from '../common/SideDot'
import { statusText } from './labels'
import type { SeatMark } from './tableMarks'

export type CardView = {
  player: PlayerView
  /** Говорит сейчас (или считаем его голоса) — самое заметное выделение на столе, оно одно. */
  highlight: boolean
  /** Ярлык в углу: «выставлен · 1». */
  badge: string | null
  /** Метки внизу карточки. Ночные (tone: night и block) скрываются вместе с ролями. */
  marks: SeatMark[]
  /** Режим выбора: null — режима нет; иначе можно ли выбрать и выбран ли. */
  pick: { allowed: boolean; picked: boolean; mark: string | null } | null
}

type Props = { view: CardView; registry: Registry; rolesHidden: boolean; onOpen(): void; onPick(): void }

/** Карточка игрока. Номер — самый крупный элемент; выбывший приглушён, причина подписана словом. */
export function PlayerCard({ view, registry, rolesHidden, onOpen, onPick }: Props) {
  const t = useT()
  const lang = useLang()
  const { player, pick } = view
  const out = player.status === 'out'
  const status = statusText(lang, player, rolesHidden)
  const selectable = pick?.allowed === true
  const marks = rolesHidden ? view.marks.filter((m) => m.tone !== 'night' && m.tone !== 'block' && m.tone !== 'solo') : view.marks
  const className = cx(
    'card',
    out && 'card-out',
    view.highlight && 'card-speaking',
    marks.some((m) => m.tone === 'block') && 'card-blocked',
    pick?.picked && 'card-picked',
    pick && !selectable && 'card-locked',
    selectable && 'card-selectable',
  )

  return (
    <li className="card-slot">
      <button
        type="button" className={className}
        aria-label={selectable ? t('pick.seat', { n: player.seat }) : t('card.player', { n: player.seat })}
        aria-disabled={pick !== null && !selectable ? true : undefined}
        onClick={pick ? (selectable ? onPick : undefined) : onOpen}
      >
        <span className="card-top">
          <span className="card-num num">{player.seat}</span>
          {view.badge && <span className="card-badge">{view.badge}</span>}
        </span>
        {rolesHidden
          ? <span className="card-hidden">{t('roles.hidden')}</span>
          : <span className="card-role"><SideDot registry={registry} side={player.side} /><span>{roleText(lang, registry, player.roleId)}</span></span>}
        {status && <span className="card-status">{status}</span>}
        <span className="card-marks">
          {marks.map((m) => <span key={`${m.tone}:${m.text}`} className={cx('card-mark', m.tone !== 'plain' && `card-mark-${m.tone}`)}>{m.text}</span>)}
          {pick?.picked && <span className="card-mark card-mark-night">{t('card.picked')}</span>}
          {pick?.mark && <span className="card-mark card-mark-night">{pick.mark}</span>}
        </span>
      </button>
      {pick && (
        <button type="button" className="card-more" aria-label={t('card.panel', { n: player.seat })} onClick={onOpen}>
          <Dots />
        </button>
      )}
    </li>
  )
}
