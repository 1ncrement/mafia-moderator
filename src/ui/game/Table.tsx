import { translateKey } from '../../app/i18n'
import { useApp, useLang, useStore, useT } from '../../app/StoreContext'
import type { GameState, Seat } from '../../engine'
import { Button } from '../common/Button'
import { PlayerCard } from './PlayerCard'
import type { CardView } from './PlayerCard'
import { useSelection } from './selection'
import { useTableMarksValue } from './tableMarks'
import type { SeatMark } from './tableMarks'

/** Что нарисовать на карточках: метки дня, ярлыки выставления, постоянные метки проверок и метки панели шага. */
function useCards(game: GameState): CardView[] {
  const t = useT()
  const lang = useLang()
  const { selection } = useSelection()
  const extra = useTableMarksValue()
  const store = useStore()
  const day = game.day
  const soloSides = new Set(store.registry.sides.filter((side) => side.solo).map((side) => side.id))

  return game.players.map((player) => {
    const seat = player.seat
    const speaking = day?.speaking?.seat === seat
    const marks: SeatMark[] = []
    if (speaking && day?.speaking?.kind !== 'silent') marks.push({ text: t('card.speaking'), tone: 'day' })
    else {
      const parts: string[] = []
      if (day?.spoken.includes(seat)) parts.push(t('card.spoke'))
      // Начинающий круг известен заранее (случайно в День 1, по очереди дальше): пока он ждёт слова — «начинает».
      if (day?.opener === seat) parts.push(t(day.waiting.includes(seat) ? 'card.opens' : 'card.opener'))
      if (day?.skipped.includes(seat)) parts.push(t('card.skipped'))
      if (parts.length > 0) marks.push({ text: parts.join(' · '), tone: 'plain' })
    }
    // Молчит сегодня: это знает весь стол — метка видна и при скрытых ролях.
    if (day?.silenced.includes(seat)) marks.push({ text: t('card.silenced'), tone: 'silent' })
    // Жилет снят — роль открыта всему столу: метка видна и при скрытых ролях.
    if (player.vest === 'used') marks.push({ text: t('card.vestOff'), tone: 'open' })
    // Одиночка помечен на карточке: его сторона — он сам. Метка скрывается вместе с ролями.
    if (soloSides.has(player.side)) marks.push({ text: t('side.solo'), tone: 'solo' })
    marks.push(...(extra.marks[seat] ?? []))
    // Постоянные метки: кого проверял шериф и кого искал глава мафии.
    for (const m of game.permanentMarks) if (m.seat === seat) marks.push({ text: translateKey(lang, `action.${m.actionId}.mark`), tone: 'night' })

    const nomination = day ? day.nominations.findIndex((x) => x.target === seat) : -1
    return {
      player,
      highlight: speaking || extra.highlight === seat,
      badge: nomination >= 0 ? t('card.nominated', { n: nomination + 1 }) : null,
      marks,
      pick: selection
        ? { allowed: selection.allowed.includes(seat), picked: selection.picked === seat || selection.alsoPicked?.includes(seat) === true, mark: selection.marks[seat] ?? null }
        : null,
    }
  })
}

/** Стол: сетка карточек по порядку номеров, 4 колонки до 12 игроков и 5 от 13. Карточки не прыгают. */
export function Table({ game, onOpen }: { game: GameState; onOpen(seat: Seat): void }) {
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
            key={view.player.seat} view={view} registry={store.registry} rolesHidden={settings.rolesHidden}
            onOpen={() => onOpen(view.player.seat)} onPick={() => selection?.onPick(view.player.seat)}
          />
        ))}
        {selection && selection.nobody !== false && (
          <li className="card-slot">
            <button type="button" className="card-nobody" aria-pressed={selection.nobodyPicked === true} onClick={() => selection.onPick(null)}>
              {t('table.nobody')}
            </button>
          </li>
        )}
      </ul>
    </section>
  )
}
