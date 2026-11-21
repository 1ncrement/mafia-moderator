import { phaseLabel, translateKey } from '../../app/i18n'
import { useApp, useLang, useStore, useT } from '../../app/StoreContext'
import { balaganInDay, SUMMARY_STEP } from '../../engine'
import type { DayState, DayStep, GameState, Rules, StepId } from '../../engine'
import { nightStepLabel } from './labels'

/**
 * Какие шаги есть у дня: в День 1 только круг; балаган — если он включён правилами партии;
 * шаги ничьей и прощания появляются, когда наступают.
 */
export function daySteps(day: DayState, step: StepId | null, rules: Rules): DayStep[] {
  const steps: DayStep[] = []
  if (balaganInDay(rules, day.n)) steps.push('balagan')
  steps.push('speeches')
  if (day.nominationsOpen) steps.push('defense', 'vote')
  const tie = day.ballots[0]?.resolved?.outcome === 'tie'
  if (tie || step === 'tiebreak' || step === 'revote') steps.push('tiebreak', 'revote')
  if (day.farewell.done.length + day.farewell.waiting.length > 0 || step === 'farewell') steps.push('farewell')
  return steps
}

/** Полоса шагов: кликабельна, можно вернуться к пройденному шагу или пропустить шаг. */
export function StepNav({ game, rules }: { game: GameState; rules: Rules }) {
  const { settings } = useApp()
  const store = useStore()
  const t = useT()
  const lang = useLang()

  if (game.day) {
    const steps = daySteps(game.day, game.step, rules)
    const at = steps.indexOf(game.step as DayStep)
    const { opener, openerRandom, n } = game.day
    return (
      <div className="steps-row">
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
        {/* Начинающего первый круг выбрало приложение — ведущий видит это, пока не выберет сам. */}
        {openerRandom && opener !== null && (
          <span className="steps-note small muted">{t('day.opener.random', { phase: phaseLabel(lang, { kind: 'day', n }), n: opener })}</span>
        )}
      </div>
    )
  }

  if (game.night) {
    const night = game.night
    const seat = (n: number | null) => (n === null ? t('journal.nobody') : t('common.seat', { n }))
    const isCustom = (roleId: string) => store.registry.roles.find((r) => r.id === roleId)?.custom === true
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
                <span className="night-step-name">
                  {nightStepLabel(lang, store.registry, night, s.id, settings.rolesHidden)}
                  {!settings.rolesHidden && isCustom(s.performerRole) && <span className="night-step-tag">{t('role.custom.tag')}</span>}
                </span>
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
