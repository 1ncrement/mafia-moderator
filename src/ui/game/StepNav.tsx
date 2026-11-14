import { translateKey } from '../../app/i18n'
import { useApp, useLang, useStore, useT } from '../../app/StoreContext'
import { SUMMARY_STEP } from '../../engine'
import type { DayState, DayStep, GameState, StepId } from '../../engine'
import { nightStepLabel } from './labels'

/** Какие шаги есть у дня: в День 1 только круг; шаги ничьей и прощания появляются, когда наступают. */
export function daySteps(day: DayState, step: StepId | null, balaganFromDay: number): DayStep[] {
  const steps: DayStep[] = []
  if (day.n >= balaganFromDay) steps.push('balagan')
  steps.push('speeches')
  if (day.nominationsOpen) steps.push('defense', 'vote')
  const tie = day.ballots[0]?.resolved?.outcome === 'tie'
  if (tie || step === 'tiebreak' || step === 'revote') steps.push('tiebreak', 'revote')
  if (day.farewell.done.length + day.farewell.waiting.length > 0 || step === 'farewell') steps.push('farewell')
  return steps
}

/** Полоса шагов: кликабельна, можно вернуться к пройденному шагу или пропустить шаг. */
export function StepNav({ game, balaganFromDay }: { game: GameState; balaganFromDay: number }) {
  const { settings } = useApp()
  const store = useStore()
  const t = useT()
  const lang = useLang()

  if (game.day) {
    const steps = daySteps(game.day, game.step, balaganFromDay)
    const at = steps.indexOf(game.step as DayStep)
    return (
      <nav className="steps" aria-label={t('steps.day')}>
        {steps.map((step, i) => (
          <button
            key={step} type="button" className="step" aria-current={step === game.step ? 'step' : undefined} data-done={i < at ? '' : undefined}
            onClick={() => step !== game.step && store.dispatchAll([{ type: 'endSpeech' }, { type: 'enterStep', step }])}
          >
            {translateKey(lang, `step.${step}`)}
          </button>
        ))}
      </nav>
    )
  }

  if (game.night) {
    const night = game.night
    const seat = (n: number | null) => (n === null ? t('journal.nobody') : t('common.seat', { n }))
    return (
      <nav aria-label={t('steps.night')}>
        <ol className="night-steps">
          {night.steps.map((s) => (
            <li key={s.id}>
              <button
                type="button" className="night-step" data-step={s.id} data-grey={s.grey && !settings.rolesHidden ? '' : undefined}
                aria-current={s.id === game.step ? 'step' : undefined}
                onClick={() => s.id !== game.step && store.dispatch({ type: 'enterStep', step: s.id })}
              >
                <span className="night-step-name">{nightStepLabel(lang, store.registry, night, s.id, settings.rolesHidden)}</span>
                <span className="night-step-side">
                  {s.grey ? !settings.rolesHidden && <span className="night-step-last">{t('night.nav.grey')}</span> : (
                    <>
                      {s.recorded && !settings.rolesHidden && <span className="night-step-pick">→ {seat(s.target)}</span>}
                      {s.lastNight.recorded && !settings.rolesHidden && <span className="night-step-last">{t('night.nav.last', { target: seat(s.lastNight.target) })}</span>}
                    </>
                  )}
                </span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button" className="night-step" data-step={SUMMARY_STEP} aria-current={game.step === SUMMARY_STEP ? 'step' : undefined}
              onClick={() => game.step !== SUMMARY_STEP && store.dispatch({ type: 'enterStep', step: SUMMARY_STEP })}
            >
              <span className="night-step-name">{t('step.summary')}</span>
            </button>
          </li>
        </ol>
      </nav>
    )
  }
  return null
}
