import { useEffect, useId, useState } from 'react'
import { hasKey, seatList, translate, translateKey } from '../../app/i18n'
import type { Lang } from '../../app/i18n'
import { useApp, useLang, useStore, useT } from '../../app/StoreContext'
import { aliveSeats, nightPlayers, quietNight } from '../../engine'
import type { GameState, NightDeath, Seat } from '../../engine'
import { Button } from '../common/Button'
import { nightStepLabel } from './labels'
import { useMainAction } from './MainButton'
import { nightMarks } from './nightMarks'
import { blockedPerformers } from './NightPanel'
import { useAskOnce, useSelection } from './selection'
import { useTableMarks } from './tableMarks'

/** Подпись главной кнопки по числу отмеченных: «Никто не выбыл», «№7 выбывает», «Выбывают двое». */
function confirmLabel(lang: Lang, died: Seat[], day: number): string {
  const only = died[0]
  if (only === undefined) return translate(lang, 'night.confirm.none', { day })
  if (died.length === 1) return translate(lang, 'night.confirm.one', { n: only, day })
  const key = `night.confirm.${died.length}`
  return hasKey(key) ? translateKey(lang, key, { day }) : translate(lang, 'night.confirm.many', { n: died.length, day })
}

/**
 * Итог ночи — подсказка приложения списком событий: «Покидают стол» с отметками и «Остаются в игре».
 * Ведущий снимает отметку или добавляет выбывшего сам; подтверждение ставит статусы одной пачкой и начинает день.
 */
export function NightSummary({ game }: { game: GameState }) {
  const { session, settings } = useApp()
  const hidden = settings.rolesHidden
  const store = useStore()
  const t = useT()
  const lang = useLang()
  const askOnce = useAskOnce()
  const { clear } = useSelection()
  // Ушли с итога ночи (подтвердили, вернулись к шагам) — вопрос «Кто ещё выбыл?» снимается.
  useEffect(() => clear, [clear])
  const outId = useId()
  const stayId = useId()
  // Решения ведущего поверх подсказки: с кого он снял отметку и кого добавил сам. Живут, пока открыт итог.
  const [unchecked, setUnchecked] = useState<Seat[]>([])
  const [added, setAdded] = useState<Seat[]>([])

  const night = game.night
  const registry = store.registry
  const alive = night && session ? aliveSeats(nightPlayers(session, registry, night.n)) : []
  const deaths = night?.outcome.deaths ?? []
  // Строки «Покидают стол»: подсказка и добавленные ведущим — по возрастанию номеров.
  // Добавленный, который с тех пор выбыл вручную или попал в подсказку, отдельной строки не имеет.
  const rows: { seat: Seat; death: NightDeath | null }[] = [
    ...deaths.map((death) => ({ seat: death.seat, death })),
    ...added.filter((seat) => alive.includes(seat) && !deaths.some((d) => d.seat === seat)).map((seat) => ({ seat, death: null })),
  ].sort((a, b) => a.seat - b.seat)
  const died = rows.map((row) => row.seat).filter((seat) => !unchecked.includes(seat))
  const day = (night?.n ?? 0) + 1

  useTableMarks(night && !hidden ? nightMarks(lang, registry, night) : {})
  useMainAction(night ? {
    // Роли скрыты — подпись не называет, кто выбывает.
    label: hidden ? t('night.confirm.hidden', { day }) : confirmLabel(lang, died, day),
    onPress: () => store.dispatch({ type: 'confirmNight', died }),
  } : null)

  if (!night || !session) return null
  const missing = night.steps.filter((s) => !s.grey && !s.recorded)
  // Кому показать блок: заблокированные исполнители ночных шагов. Нужна, когда блокирующая роль ходит после них.
  const blocked = [...new Set(night.steps.flatMap(blockedPerformers))].sort((a, b) => a - b)
  const quiet = quietNight(night.outcome)
  /** Строка по ключу, которого может не быть: причина и заметка описаны данными, новые роли добавляют свои. */
  const text = (key: string) => (hasKey(key) ? translateKey(lang, key) : '')

  const toggle = (seat: Seat) => setUnchecked((list) => (list.includes(seat) ? list.filter((s) => s !== seat) : [...list, seat]))
  const add = () => askOnce({
    question: t('night.add.question'),
    allowed: alive.filter((seat) => !rows.some((row) => row.seat === seat)),
    onPick: (seat) => {
      if (seat !== null) setAdded((list) => [...list.filter((s) => s !== seat), seat])
    },
  })

  return (
    <div className="night">
      <div className="result-head">
        <h3 className="result-title">{t('night.result.title', { night: night.n })}</h3>
        <span className="result-sub">{t('night.result.sub')}</span>
      </div>
      {hidden && <p className="journal-hidden">{t('night.hidden')}</p>}

      {!hidden && blocked.length > 0 && (
        <p className="block-line" role="status">
          {t(blocked.length > 1 ? 'night.sum.blocked.many' : 'night.sum.blocked.one', { seats: seatList(lang, blocked) })}
        </p>
      )}

      <div className="result-group" role="group" aria-labelledby={outId}>
        <span id={outId} className="result-cap result-cap-out">{t('night.result.out')}</span>
        {rows.map(({ seat, death }) => {
          const on = !unchecked.includes(seat)
          return (
            <label key={seat} className="result-row result-row-out" data-off={on ? undefined : ''}>
              <input type="checkbox" className="result-check" checked={on} aria-label={t('night.result.mark', { n: seat })} onChange={() => toggle(seat)} />
              <span className="result-seat num">{t('common.seat', { n: seat })}</span>
              {/* Причина выдала бы, чьих рук это дело: при скрытых ролях остаётся только номер. */}
              {!hidden && (
                <span className="result-text">
                  <span className="result-main">{death ? text(`night.death.${death.cause}`) : t('night.death.manual')}</span>
                  <span className="result-note">{death ? text(`night.death.${death.cause}.sub`) : t('night.death.manual.sub')}</span>
                </span>
              )}
            </label>
          )
        })}
        {rows.length === 0 && (
          <div className="result-row result-row-empty">
            <span className="result-text">
              <span className="result-main">{t('night.result.nobody')}</span>
              {!hidden && quiet && <span className="result-note">{t(`night.quiet.${quiet}`)}</span>}
            </span>
          </div>
        )}
      </div>

      {!hidden && night.outcome.notes.length > 0 && (
        <div className="result-group" role="group" aria-labelledby={stayId}>
          <span id={stayId} className="result-cap">{t('night.result.stay')}</span>
          {night.outcome.notes.map((note) => (
            <div key={`${note.kind}:${note.seat}`} className="result-row result-row-stay">
              <span className="result-seat num">{t('common.seat', { n: note.seat })}</span>
              <span className="result-text">
                <span className="result-main">{text(`night.note.${note.kind}`)}</span>
                <span className="result-note">{text(`night.note.${note.kind}.${note.cause ?? 'safe'}`)}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {!hidden && missing.length > 0 && (
        <p className="step-warning">{t('night.missing', { list: missing.map((s) => nightStepLabel(lang, registry, night, s.id)).join(', ') })}</p>
      )}

      <div className="speech-secondary">
        <Button size="l" onClick={add}>{t('night.add')}</Button>
        <Button size="l" onClick={() => store.dispatch({ type: 'enterStep', step: night.steps[0]?.id ?? '' })}>{t('night.sum.back')}</Button>
      </div>
    </div>
  )
}
