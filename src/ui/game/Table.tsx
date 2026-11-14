import { translateKey } from '../../app/i18n'
import { useApp, useLang, useStore, useT } from '../../app/StoreContext'
import type { GameState, Seat } from '../../engine'
import { Button } from '../common/Button'
import { PlayerCard } from './PlayerCard'
import type { CardView } from './PlayerCard'
import { useSelection } from './selection'

/** Что нарисовать на карточках: метки дня, ярлыки выставления, постоянные метки проверок. */
function useCards(game: GameState): CardView[] {
  const t = useT()
  const lang = useLang()
  const { selection } = useSelection()
  const day = game.day
  const voting = day !== null && (game.step === 'vote' || game.step === 'revote')
  const ballot = voting ? (game.step === 'revote' ? day.ballots[1] : day.ballots[0]) : undefined

  return game.players.map((player) => {
    const seat = player.seat
    const dayParts: string[] = []
    if (day?.spoken.includes(seat)) dayParts.push(t('card.spoke'))
    if (day?.opener === seat) dayParts.push(t('card.opener'))
    if (day?.skipped.includes(seat)) dayParts.push(t('card.skipped'))

    // В голосовании на месте номера выставления — число голосов.
    let badge: string | null = null
    const nomination = day ? day.nominations.findIndex((x) => x.target === seat) : -1
    const votes = ballot?.entries.find((e) => e.candidate === seat)
    if (votes) badge = votes.count === null ? t('card.votes.none') : t('card.votes', { n: votes.count })
    else if (nomination >= 0) badge = t('card.nominated', { n: nomination + 1 })

    const nightMarks = game.permanentMarks.filter((m) => m.seat === seat).map((m) => translateKey(lang, `action.${m.actionId}.mark`))

    return {
      player,
      speaking: day?.speaking?.seat === seat,
      badge,
      dayMark: dayParts.length > 0 ? dayParts.join(' · ') : null,
      nightMarks,
      pick: selection
        ? { allowed: selection.allowed.includes(seat), picked: selection.picked === seat, mark: selection.marks[seat] ?? null }
        : null,
    }
  })
}

/** Стол: сетка карточек по порядку номеров, 4 колонки до 12 игроков и 5 от 13. Карточки не прыгают. */
export function Table({ game, onOpen, extraMarks }: { game: GameState; onOpen(seat: Seat): void; extraMarks?: Record<Seat, string[]> }) {
  const { settings } = useApp()
  const store = useStore()
  const t = useT()
  const { selection } = useSelection()
  const cards = useCards(game)

  return (
    <section className={selection ? 'table table-picking' : 'table'} aria-label={t('table.title')}>
      <div className="table-head">
        {selection
          ? <h2 className="table-question">{selection.question}</h2>
          : <h2 className="h2">{t('table.title')}</h2>}
        <span className="small muted">{selection ? t('table.hint.pick') : t('table.hint')}</span>
        {selection && selection.cancel !== false && <Button onClick={selection.onCancel}>{t('common.cancel')}</Button>}
      </div>
      <ul className="table-grid" aria-label={t('table.label')} data-columns={game.players.length > 12 ? 5 : 4}>
        {cards.map((view) => (
          <PlayerCard
            key={view.player.seat}
            view={extraMarks?.[view.player.seat] ? { ...view, nightMarks: [...view.nightMarks, ...(extraMarks[view.player.seat] ?? [])] } : view}
            registry={store.registry} rolesHidden={settings.rolesHidden}
            onOpen={() => onOpen(view.player.seat)} onPick={() => selection?.onPick(view.player.seat)}
          />
        ))}
        {selection && selection.nobody !== false && (
          <li className="card-slot">
            <button type="button" className={selection.picked === null ? 'card-nobody' : 'card-nobody'} onClick={() => selection.onPick(null)}>
              {t('table.nobody')}
            </button>
          </li>
        )}
      </ul>
    </section>
  )
}
