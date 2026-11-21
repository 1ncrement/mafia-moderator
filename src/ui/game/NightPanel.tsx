import { useEffect, useState } from 'react'
import { answerText, cap, hasKey, roleName, roleText, seatList, stepQuestion, translateKey } from '../../app/i18n'
import { useApp, useLang, useStore, useT } from '../../app/StoreContext'
import { SUMMARY_STEP } from '../../engine'
import type { GameState, NightState, NightStep, Seat } from '../../engine'
import { Button } from '../common/Button'
import { Blocked } from '../common/icons'
import { nightStepLabel } from './labels'
import { useMainAction } from './MainButton'
import { nightMarks } from './nightMarks'
import { useSelection } from './selection'
import { useTableMarks } from './tableMarks'

/** Исполнители шага под блоком, которым надо показать, что они заблокированы. У шага самой блокирующей роли таких нет. */
export const blockedPerformers = (step: NightStep): Seat[] => (step.effect === 'block' ? [] : step.blockedActors)

/**
 * Красный блок: исполнитель шага заблокирован. Говорит, кому показать блок и что этой ночью не состоится —
 * или что блок на действие не влияет. При скрытых ролях номера нет: на шаге роли он выдал бы, кто её носитель.
 */
function BlockNotice({ night, step, hidden }: { night: NightState; step: NightStep; hidden: boolean }) {
  const t = useT()
  const lang = useLang()
  const seats = blockedPerformers(step)
  if (seats.length === 0) return null
  // Чей это блок — по шагу блокирующей роли, выбравшей этого игрока.
  const blocker = night.steps.find((s) => s.effect === 'block' && s.target !== null && seats.includes(s.target))
  const bannerKey = `action.${blocker?.actionId ?? ''}.banner`
  // Что с действием шага: у действия может быть своя фраза, иначе — общая по виду эффекта.
  const state = step.blocked ? 'blocked' : 'unaffected'
  const actionKey = `action.${step.actionId}.${state}`
  const effectKey = `night.block.${step.effect}.${state}`
  const consequence = hasKey(actionKey) ? translateKey(lang, actionKey) : hasKey(effectKey) ? translateKey(lang, effectKey) : ''
  const many = seats.length > 1 && !hidden
  const recordKey = step.effect === 'check_side' || step.effect === 'find_role' ? 'night.block.record.answer' : 'night.block.record'
  return (
    <>
      <div className="block-box" role="alert">
        <span className="block-box-head"><Blocked />{hasKey(bannerKey) ? translateKey(lang, bannerKey) : t('night.block.title')}</span>
        <span className="block-box-big num">
          {hidden ? t('night.block.hidden') : t(many ? 'night.block.seats.many' : 'night.block.seats.one', { seats: seatList(lang, seats) })}
        </span>
        <span className="block-box-text">{[t(many ? 'night.block.show.many' : 'night.block.show.one'), consequence].filter(Boolean).join(' ')}</span>
      </div>
      {step.blocked && <span className="block-box-hint">{t(recordKey)}</span>}
    </>
  )
}

/**
 * Шаг ночи: стол в режиме выбора с вопросом действия, решение этой роли прошлой ночью,
 * ответ шерифу и главе мафии. Ничего не запрещает: повтор цели — предупреждение с «Записать всё равно».
 */
export function NightPanel({ game }: { game: GameState }) {
  const { session, settings } = useApp()
  const hidden = settings.rolesHidden
  const store = useStore()
  const t = useT()
  const lang = useLang()
  const { selection, ask, clear } = useSelection()
  /** Стол свободен: разовый вопрос (обмен ролями) закрыт — ночной выбор надо вернуть. */
  const idle = selection === null
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
  const question = !step || !def ? '' : stepQuestion(lang, registry, def, step.performerRole, step.inherited)

  // Стол держит режим выбора, пока открыт несерый шаг.
  useEffect(() => {
    if (!session || !night || !step || grey) return
    const record = (seat: Seat | null, force?: true) => {
      // Клик может прийти раньше перерисовки стола: шаг берём из состояния на момент нажатия.
      const now = store.getState().game
      const current = now?.night?.steps.find((s) => s.id === now.step)
      if (!current || current.grey) return
      const result = store.dispatch({ type: 'recordNightAction', actionId: current.actionId, actor: current.actor, target: seat, force })
      setRepeat(!result.ok && result.reason === 'repeat_target' && seat !== null ? { step: current.id, target: seat } : null)
    }
    ask({
      question,
      allowed: step.allowed,
      // Роли скрыты — записанный выбор и цель прошлой ночи на столе не показываем.
      picked: hidden ? null : target,
      nobodyPicked: !hidden && recorded && target === null,
      marks: !hidden && lastTarget !== null ? { [lastTarget]: t('night.mark.last') } : {},
      onPick: (seat) => record(seat),
      onCancel: () => {},
      cancel: false,
    })
    // вопрос пересобирается, когда меняется шаг, запись или журнал
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId, grey, target, recorded, lastTarget, question, log, ask, hidden, idle])
  useEffect(() => clear, [clear, stepId])

  useTableMarks(night && step && !hidden ? nightMarks(lang, registry, night, step.actors) : {})

  const ids = night ? [...night.steps.map((s) => s.id), SUMMARY_STEP] : []
  const next = ids[ids.indexOf(game.step ?? '') + 1] ?? SUMMARY_STEP
  useMainAction(night ? {
    label: next === SUMMARY_STEP ? t('step.summary') : t('night.next', { step: nightStepLabel(lang, registry, night, next, hidden) }),
    onPress: () => store.dispatch({ type: 'enterStep', step: next }),
  } : null)

  if (!night || !step || !def) return null
  const role = roleName(lang, registry, step.performerRole)
  const answer = step.answer
  const pending = repeat && repeat.step === step.id ? repeat.target : null
  const seat = (n: Seat) => t('common.seat', { n })

  const pendingBox = pending !== null && (
            <div className="night-repeat" role="alert">
              <span>{hasKey(`action.${step.actionId}.repeat`) ? translateKey(lang, `action.${step.actionId}.repeat`) : t('night.repeat')}</span>
              <Button variant="strong" onClick={() => {
                store.dispatch({ type: 'recordNightAction', actionId: step.actionId, actor: step.actor, target: pending, force: true })
                setRepeat(null)
              }}>{t('night.force')}</Button>
            </div>
            )

  return (
    <div className="night">
      {hidden ? (
        <div className="night-lines">
          <span>{t('night.wakes.hidden', { role })}</span>
          <span>{t('night.hidden')}</span>
        </div>
      ) : step.grey ? (
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
          <BlockNotice night={night} step={step} hidden={false} />
          {pending !== null && pendingBox}
          {answer && (answer.kind === 'side' || answer.kind === 'found') && step.target !== null && (
            <div className="answer">
              <span className="answer-cap">{t('night.answer', { step: nightStepLabel(lang, registry, night, step.id) })}</span>
              <span className={answer.kind === 'found' && !answer.found ? 'answer-big answer-mid num' : 'answer-big num'}>
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
          {/* Визит: первый — жертва завтра молчит; повторный — нападение. Что будет с жертвой, покажет итог ночи. */}
          {answer?.kind === 'visit' && step.target !== null && (
            <div className="answer">
              <span className="answer-cap">{t('night.recorded', { step: nightStepLabel(lang, registry, night, step.id) })}</span>
              <span className="answer-big answer-mid num">{t(answer.lethal ? 'night.visit.again' : 'night.visit.first')}</span>
              <span className="answer-cap">{t(answer.lethal ? 'night.visit.again.sub' : 'night.visit.first.sub', { seat: seat(step.target) })}</span>
            </div>
          )}
          {step.effect === 'note' && step.recorded && (
            <div className="answer">
              <span className="answer-cap">{t('night.recorded', { step: nightStepLabel(lang, registry, night, step.id) })}</span>
              <span className="answer-big num">→ {step.target === null ? t('journal.nobody') : seat(step.target)}</span>
              <span className="answer-cap">{t('night.custom.note')}</span>
            </div>
          )}
        </>
      )}
      {/* Блок виден и при скрытых ролях: ведущему надо показать игроку, что он заблокирован. */}
      {hidden && <BlockNotice night={night} step={step} hidden />}
      {hidden && pending !== null && pendingBox}
    </div>
  )
}
