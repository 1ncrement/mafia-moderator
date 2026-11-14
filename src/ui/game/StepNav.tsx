import { translateKey } from '../../app/i18n'
import { useLang, useStore, useT } from '../../app/StoreContext'
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
    const ids = [...game.night.steps.map((s) => s.id), SUMMARY_STEP]
    return (
      <nav className="steps steps-night" aria-label={t('steps.night')}>
        {ids.map((id) => (
          <button
            key={id} type="button" className="step" data-step={id} aria-current={id === game.step ? 'step' : undefined}
            onClick={() => id !== game.step && store.dispatch({ type: 'enterStep', step: id })}
          >
            {nightStepLabel(lang, store.registry, game.night, id)}
          </button>
        ))}
      </nav>
    )
  }
  return null
}
