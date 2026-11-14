import { useState } from 'react'
import { seatList } from '../../app/i18n'
import { useApp, useLang, useStore, useT } from '../../app/StoreContext'
import type { Command, GameState, RejectCode, Seat } from '../../engine'
import { Button } from '../common/Button'
import { aliveOf } from './dayFlow'
import { useMainAction } from './MainButton'
import type { MainAction } from './MainButton'
import { NominationList } from './NominationList'
import { useAskOnce } from './selection'
import { TimerPanel } from './TimerPanel'

/** Почему движок отклонил выставление — строкой для ведущего. */
export function useNominationNotice() {
  const t = useT()
  return (reason: RejectCode, target: Seat): string => reason === 'already_nominated' ? t('day.nominate.already', { n: target })
    : reason === 'not_alive' ? t('day.nominate.out', { n: target })
    : t('day.nominate.closed')
}

/**
 * Панель дневных шагов с таймером: балаган, круг речей, оправдания, речи при ничьей, прощание.
 * Главная кнопка называет результат: «Следующий: №6 · 60 с».
 */
export function SpeechPanel({ game, flash }: { game: GameState; flash?: boolean }) {
  const { session } = useApp()
  const store = useStore()
  const t = useT()
  const lang = useLang()
  const askOnce = useAskOnce()
  const noticeFor = useNominationNotice()
  const [notice, setNotice] = useState<string | null>(null)
  const day = game.day
  const step = game.step
  const durations = session?.config.durations
  let main: MainAction = null
  let body: React.ReactNode = null
  let secondary: React.ReactNode = null

  if (day && durations) {
    const sec = (kind: keyof typeof durations) => t('unit.sec', { n: durations[kind] })
    const speaking = day.speaking
    const toNight: Command = { type: 'startPhase', phase: { kind: 'night', n: day.n } }
    const go = (next: string) => store.dispatchAll([{ type: 'endSpeech' }, { type: 'enterStep', step: next }])
    const askOpener = () => askOnce({
      question: t('day.opener.question'),
      allowed: aliveOf(game),
      onPick: (seat) => {
        if (seat !== null) store.dispatch({ type: 'openCircle', first: seat })
      },
    })
    /** Закончить очередь по 30 секунд без речи: кандидат отмечается высказавшимся. */
    const skipIn = (kind: 'defense' | 'tiebreak' | 'farewell', seat: Seat) =>
      store.dispatchAll([{ type: 'startSpeech', kind, seat }, { type: 'endSpeech' }])
    const active = day.nominations.filter((x) => x.active)

    if (step === 'balagan') {
      const running = speaking?.kind === 'balagan'
      const toCircle = () => {
        go('speeches')
        askOpener()
      }
      main = running
        ? { label: t('day.pickOpener.afterBalagan'), onPress: toCircle }
        : { label: t('day.balagan.start', { sec: sec('balagan') }), onPress: () => store.speak('balagan', null) }
      body = <p className="muted">{t('day.balagan.hint')}</p>
      secondary = !running && <Button variant="outline" size="l" onClick={toCircle}>{t('day.balagan.skip')}</Button>
    }

    if (step === 'speeches') {
      const started = day.opener !== null || day.spoken.length > 0 || speaking?.kind === 'speech'
      const next = day.waiting[0]
      if (!started) main = { label: t('day.pickOpener'), onPress: askOpener }
      else if (next !== undefined) {
        const first = day.spoken.length === 0 && speaking?.kind !== 'speech'
        main = { label: t(first ? 'day.give' : 'day.next', { n: next, sec: sec('speech') }), onPress: () => store.speak('speech', next) }
      } else if (!day.nominationsOpen) main = { label: t('day.toNight', { n: day.n }), onPress: () => store.dispatch(toNight) }
      else if (active.length > 0) main = { label: t('day.toDefense', { n: active.length }), onPress: () => go('defense') }
      else main = { label: t('day.noNominations', { n: day.n }), onPress: () => store.dispatch(toNight) }

      const speaker = speaking?.kind === 'speech' ? speaking.seat : null
      const nominate = (by: Seat) => askOnce({
        question: t('day.nominate.question', { n: by }),
        allowed: aliveOf(game),
        marks: Object.fromEntries(day.nominations.map((x) => [x.target, t('day.nominate.mark')])),
        onPick: (target) => {
          if (target === null) return
          const result = store.dispatch({ type: 'nominate', by, target })
          setNotice(result.ok ? null : noticeFor(result.reason, target))
        },
      })
      body = (
        <>
          {day.nominationsOpen && (
            <>
              {speaker !== null && <Button variant="strong" className="speech-nominate" onClick={() => nominate(speaker)}>{t('day.nominates', { n: speaker })}</Button>}
              {notice && <p className="alert-line" role="status">{notice}</p>}
              <NominationList game={game} day={day} />
            </>
          )}
          <dl className="facts">
            <dt>{t('day.spoke')}</dt><dd>{day.spoken.join(' · ') || '—'}</dd>
            <dt>{t('day.waiting')}</dt><dd>{day.opener === null ? '—' : day.waiting.join(' · ') || '—'}</dd>
            {day.skipped.length > 0 && <><dt>{t('day.skipped')}</dt><dd>{day.skipped.join(' · ')}</dd></>}
            {day.previousOpener !== null && <><dt>{t('day.yesterday')}</dt><dd>{t('common.seat', { n: day.previousOpener })}</dd></>}
          </dl>
        </>
      )
      secondary = started && (
        <>
          {next !== undefined && <Button variant="outline" size="l" onClick={() => store.dispatch({ type: 'skipSpeaker', seat: next })}>{t('day.skipNext', { n: next })}</Button>}
          <Button variant="outline" size="l" onClick={askOpener}>{t('day.restart')}</Button>
        </>
      )
    }

    if (step === 'defense' || step === 'tiebreak' || step === 'farewell') {
      const queue = day[step]
      const next = queue.waiting[0]
      const current = speaking?.kind === step ? speaking.seat : null
      const order = [...queue.done, ...(current !== null ? [current] : []), ...queue.waiting]
      const going = queue.done.length > 0 || current !== null

      if (step === 'defense') {
        const only = active.length === 1 ? active[0] : undefined
        if (next !== undefined) main = { label: t(going ? 'day.next' : 'day.defense', { n: next, sec: sec('defense') }), onPress: () => store.speak('defense', next) }
        else if (only) {
          // Выставлен один: голосования нет, сразу прощание.
          main = {
            label: t('day.single', { n: only.target, sec: sec('farewell') }),
            onPress: () => store.dispatchAll([{ type: 'endSpeech' }, { type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [only.target] }, { type: 'enterStep', step: 'farewell' }]),
          }
          secondary = (
            <Button variant="outline" size="l" onClick={() => store.dispatchAll([{ type: 'resolveVote', ballot: 1, outcome: 'nobody', seats: [] }, toNight])}>
              {t('day.nobodyOut', { n: day.n })}
            </Button>
          )
        } else if (active.length > 1) main = { label: t('day.toVote'), onPress: () => go('vote') }
        else main = { label: t('day.noNominations', { n: day.n }), onPress: () => store.dispatch(toNight) }
      }
      if (step === 'tiebreak') {
        main = next !== undefined
          ? { label: t('day.tiebreak', { n: next, sec: sec('tiebreak') }), onPress: () => store.speak('tiebreak', next) }
          : { label: t('day.toRevote'), onPress: () => go('revote') }
      }
      if (step === 'farewell') {
        main = next !== undefined
          ? { label: t('day.farewell', { n: next, sec: sec('farewell') }), onPress: () => store.speak('farewell', next) }
          : { label: t('day.toNight', { n: day.n }), onPress: () => store.dispatch(toNight) }
      }

      const title = step === 'farewell' && order.length > 0 ? t('day.farewell.title', { seats: seatList(lang, order) })
        : step === 'tiebreak' && order.length > 0 ? t('day.tie.title', { seats: seatList(lang, order) })
        : null
      body = (
        <>
          {title && <p className="speech-title">{title}</p>}
          <div className="queue">
            <span className="small muted">{t('day.queue')}</span>
            <ol className="queue-list">
              {order.map((seat) => (
                <li key={seat} className="queue-item num" data-state={seat === current ? 'now' : queue.done.includes(seat) ? 'done' : 'wait'}>{seat}</li>
              ))}
              {order.length === 0 && <li className="muted">—</li>}
            </ol>
          </div>
        </>
      )
      if (next !== undefined && !secondary) {
        secondary = <Button variant="outline" size="l" onClick={() => skipIn(step, next)}>{t('day.skipNext', { n: next })}</Button>
      }
    }
  }

  useMainAction(main)
  if (!day) return null
  return (
    <div className="speech">
      <TimerPanel game={game} flash={flash} />
      {body}
      {secondary && <div className="speech-secondary">{secondary}</div>}
    </div>
  )
}
