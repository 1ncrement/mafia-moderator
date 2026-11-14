import { useEffect, useState } from 'react'
import { answerText, cap, hasKey, roleName, roleText, seatList, translateKey } from '../../app/i18n'
import { useApp, useLang, useStore, useT } from '../../app/StoreContext'
import { aliveSeats, playersAt, SUMMARY_STEP } from '../../engine'
import type { GameState, NightStep, Seat } from '../../engine'
import { Button } from '../common/Button'
import { nightStepLabel } from './labels'
import { useMainAction } from './MainButton'
import { nightMarks } from './nightMarks'
import { useSelection } from './selection'
import { useTableMarks } from './tableMarks'

/**
 * Шаг ночи: стол в режиме выбора с вопросом действия, решение этой роли прошлой ночью,
 * ответ шерифу и главе мафии. Ничего не запрещает: повтор цели — предупреждение с «Записать всё равно».
 */
export function NightPanel({ game }: { game: GameState }) {
  const { session } = useApp()
  const store = useStore()
  const t = useT()
  const lang = useLang()
  const { ask, clear } = useSelection()
  const registry = store.registry
  const night = game.night
  const step: NightStep | undefined = night?.steps.find((s) => s.id === game.step)
  /** Цель, которую движок отклонил как повтор прошлой ночи. */
  const [repeat, setRepeat] = useState<{ step: string; target: Seat } | null>(null)
  const def = registry.nightActions.find((a) => a.id === step?.actionId)
  const log = session?.log

  const stepId = step?.id
  const grey = step?.grey ?? true
  const target = step?.target ?? null
  const recorded = step?.recorded ?? false
  const lastTarget = step?.lastNight.recorded ? step.lastNight.target : null
  const question = !step || !def ? ''
    : step.inherited && hasKey(`${def.questionKey}.inherited`)
      ? translateKey(lang, `${def.questionKey}.inherited`, { role: roleName(lang, registry, step.performerRole) })
      : translateKey(lang, def.questionKey)

  // Стол держит режим выбора, пока открыт несерый шаг.
  useEffect(() => {
    if (!session || !night || !step || grey) return
    const record = (seat: Seat | null, force?: true) => {
      const result = store.dispatch({ type: 'recordNightAction', actionId: step.actionId, actor: step.actor, target: seat, force })
      setRepeat(!result.ok && result.reason === 'repeat_target' && seat !== null ? { step: step.id, target: seat } : null)
    }
    ask({
      question,
      allowed: aliveSeats(playersAt(session, registry, { kind: 'night', n: night.n })),
      picked: target,
      nobodyPicked: recorded && target === null,
      marks: lastTarget !== null ? { [lastTarget]: t('night.mark.last') } : {},
      onPick: (seat) => record(seat),
      onCancel: () => {},
      cancel: false,
    })
    // вопрос пересобирается, когда меняется шаг, запись или журнал
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId, grey, target, recorded, lastTarget, question, log, ask])
  useEffect(() => clear, [clear, stepId])

  useTableMarks(night && step ? nightMarks(lang, night, step.actors) : {})

  const ids = night ? [...night.steps.map((s) => s.id), SUMMARY_STEP] : []
  const next = ids[ids.indexOf(game.step ?? '') + 1] ?? SUMMARY_STEP
  useMainAction(night ? {
    label: next === SUMMARY_STEP ? t('step.summary') : t('night.next', { step: nightStepLabel(lang, registry, night, next) }),
    onPress: () => store.dispatch({ type: 'enterStep', step: next }),
  } : null)

  if (!night || !step || !def) return null
  const role = roleName(lang, registry, step.performerRole)
  const blockedKey = `night.blocked.${step.effect}`
  const answer = step.answer
  const pending = repeat && repeat.step === step.id ? repeat.target : null
  const seat = (n: Seat) => t('common.seat', { n })

  return (
    <div className="night">
      {step.grey ? (
        <div className="night-grey">
          <span className="night-grey-title">{cap(role)}: {t('night.nav.grey')}</span>
          <span className="muted">{t('night.grey.text')}</span>
        </div>
      ) : (
        <>
          <div className="night-lines">
            <span>{t('night.wakes', { role, seats: seatList(lang, step.actors) })}</span>
            {step.lastNight.recorded && (
              <span>
                {t('night.last', { target: step.lastNight.target === null ? t('journal.nobody') : seat(step.lastNight.target) })}
                {answerText(lang, registry, { actionId: step.actionId, answer: step.lastNight.answer })}
              </span>
            )}
          </div>
          {step.blocked && hasKey(blockedKey) && <p className="night-blocked">{translateKey(lang, blockedKey)}</p>}
          {pending !== null && (
            <div className="night-repeat" role="alert">
              <span>{hasKey(`action.${step.actionId}.repeat`) ? translateKey(lang, `action.${step.actionId}.repeat`) : t('night.repeat')}</span>
              <Button variant="strong" onClick={() => {
                store.dispatch({ type: 'recordNightAction', actionId: step.actionId, actor: step.actor, target: pending, force: true })
                setRepeat(null)
              }}>{t('night.force')}</Button>
            </div>
          )}
          {answer && answer.kind !== 'blocked' && step.target !== null && (
            <div className="answer">
              <span className="answer-cap">{t('night.answer', { step: nightStepLabel(lang, registry, night, step.id) })}</span>
              <span className="answer-big num">
                {seat(step.target)} — {answer.kind === 'side'
                  ? translateKey(lang, `side.${answer.side}.one`)
                  : answer.found ? roleName(lang, registry, def.findRole ?? '') : t('journal.notRole', { role: roleName(lang, registry, def.findRole ?? '') })}
              </span>
              <span className="answer-cap">
                {answer.kind === 'side'
                  ? roleText(lang, registry, game.players[step.target - 1]?.roleId ?? '')
                  : t(answer.found ? 'night.show.found' : 'night.show.notFound')}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
