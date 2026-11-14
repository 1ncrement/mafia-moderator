import { useEffect } from 'react'
import { answerText, roleName } from '../../app/i18n'
import { useApp, useLang, useStore, useT } from '../../app/StoreContext'
import { aliveSeats, nightPlayers } from '../../engine'
import type { GameState, NightState } from '../../engine'
import { Button } from '../common/Button'
import { nightStepLabel } from './labels'
import { useMainAction } from './MainButton'
import { nightMarks } from './nightMarks'
import { useAskOnce, useSelection } from './selection'
import { useTableMarks } from './tableMarks'

/** Подсказка итога ночи одной строкой. Ведущий подтверждает её или меняет. */
function useHintText(night: NightState | null): { big: string; detail: string } {
  const t = useT()
  const lang = useLang()
  const store = useStore()
  if (!night) return { big: '', detail: '' }
  const { outcome } = night
  const shotAt = outcome.shotAt ?? 0
  switch (outcome.reason) {
    case 'shot':
      return { big: t('night.hint.shot', { n: shotAt }), detail: t('night.hint.shot.detail', { n: shotAt }) }
    case 'healed': {
      const healers = night.steps.filter((s) => s.effect === 'heal' && s.target === shotAt && !s.blocked)
      const who = [...new Set(healers.map((s) => roleName(lang, store.registry, s.performerRole)))].join(', ')
      return { big: t('night.hint.healed', { who, n: shotAt }), detail: '' }
    }
    case 'shooter_blocked':
      return { big: t('night.hint.none'), detail: t('night.hint.blocked.detail') }
    default:
      return { big: t('night.hint.none'), detail: t('night.hint.noshot.detail') }
  }
}

/** Итог ночи: сводка по строке на шаг, крупная подсказка, подтверждение одной кнопкой. */
export function NightSummary({ game }: { game: GameState }) {
  const { session, settings } = useApp()
  const hidden = settings.rolesHidden
  const store = useStore()
  const t = useT()
  const lang = useLang()
  const askOnce = useAskOnce()
  const { clear } = useSelection()
  // Ушли с итога ночи (подтвердили другой кнопкой, вернулись к шагам) — вопрос «Кто выбыл?» снимается.
  useEffect(() => clear, [clear])
  const night = game.night
  const hint = useHintText(night)
  const dies = night?.outcome.dies ?? null
  const day = (night?.n ?? 0) + 1

  useTableMarks(night && !hidden ? nightMarks(lang, night) : {})
  useMainAction(night ? {
    // Роли скрыты — подпись не называет, кто выбывает.
    label: hidden ? t('night.confirm.hidden', { day }) : dies === null ? t('night.confirm.none', { day }) : t('night.confirm.shot', { n: dies, day }),
    onPress: () => store.dispatch({ type: 'confirmNight', chosen: dies }),
  } : null)

  if (!night || !session) return null
  const registry = store.registry
  const missing = night.steps.filter((s) => !s.grey && !s.recorded)
  const seat = (n: number) => t('common.seat', { n })

  const other = (
    <Button size="l" onClick={() => askOnce({
      question: t('night.other.question'),
      allowed: aliveSeats(nightPlayers(session, registry, night.n)),
      onPick: (chosen) => {
        if (chosen !== null) store.dispatch({ type: 'confirmNight', chosen })
      },
    })}>{t('night.other')}</Button>
  )
  if (hidden) {
    return (
      <div className="night">
        <p className="journal-hidden">{t('night.hidden')}</p>
        <div className="speech-secondary">{other}</div>
      </div>
    )
  }

  return (
    <div className="night">
      <div className="night-sum">
        <span className="small muted">{t('night.sum.title')}</span>
        <dl className="facts night-sum-list">
          {night.steps.map((s) => (
            <div key={s.id} className="night-sum-row">
              <dt>{nightStepLabel(lang, registry, night, s.id)}</dt>
              <dd className={s.recorded ? undefined : 'muted'}>
                {s.grey ? t('night.sum.out', { role: roleName(lang, registry, s.performerRole) })
                  : !s.recorded ? t('night.sum.none')
                  : <>→ <strong>{s.target === null ? t('journal.nobody') : seat(s.target)}</strong>{answerText(lang, registry, s)}</>}
              </dd>
            </div>
          ))}
        </dl>
        <Button variant="outline" className="night-back" onClick={() => store.dispatch({ type: 'enterStep', step: night.steps[0]?.id ?? '' })}>
          {t('night.sum.back')}
        </Button>
      </div>

      <div className="answer">
        <span className="answer-cap">{t('night.sum.hint')}</span>
        <span className={hint.big.length > 16 ? 'answer-big answer-long num' : 'answer-big num'}>{hint.big}</span>
        {hint.detail && <span className="answer-cap">{hint.detail}</span>}
      </div>
      {missing.length > 0 && (
        <p className="step-warning">{t('night.missing', { list: missing.map((s) => nightStepLabel(lang, registry, night, s.id)).join(', ') })}</p>
      )}

      <div className="speech-secondary">
        {dies !== null && <Button size="l" onClick={() => store.dispatch({ type: 'confirmNight', chosen: null })}>{t('night.nobody')}</Button>}
        {other}
      </div>
    </div>
  )
}
