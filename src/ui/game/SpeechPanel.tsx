import { useState } from 'react'
import { seatList } from '../../app/i18n'
import { useApp, useLang, useStore, useT } from '../../app/StoreContext'
import { balaganInDay } from '../../engine'
import type { Command, GameState, RejectCode, Seat } from '../../engine'
import { Button } from '../common/Button'
import { afterExpelled, aliveOf, sparedByVest } from './dayFlow'
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
 * Панель дневных шагов с таймером: прощание после ночной смерти, балаган, круг речей, оправдания, речи при ничьей, прощание выгнанного.
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
  const rules = session?.config.rules
  let main: MainAction = null
  let body: React.ReactNode = null
  let secondary: React.ReactNode = null

  if (day && durations && rules) {
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
    /** Закончить очередь без речи: игрок отмечается высказавшимся. */
    const skipIn = (kind: 'closing' | 'defense' | 'tiebreak' | 'farewell', seat: Seat) =>
      store.dispatchAll([{ type: 'startSpeech', kind, seat }, { type: 'endSpeech' }])
    const active = day.nominations.filter((x) => x.active)
    // Начинающий уже стоит (по очереди со вчерашнего дня) — приложение не переспрашивает, а сразу открывает круг.
    const opensCircle = day.opener === null ? null : day.waiting[0] ?? day.opener
    const toCircle = () => {
      go('speeches')
      if (opensCircle === null) askOpener()
    }
    const toCircleLabel = opensCircle === null ? t('day.pickOpener.afterBalagan') : t('day.toCircle', { n: opensCircle })

    if (step === 'balagan') {
      const running = speaking?.kind === 'balagan'
      main = running
        ? { label: toCircleLabel, onPress: toCircle }
        : { label: t('day.balagan.start', { sec: sec('balagan') }), onPress: () => store.speak('balagan', null) }
      body = <p className="muted">{t('day.balagan.hint')}</p>
      secondary = !running && <Button variant="outline" size="l" onClick={toCircle}>{t('day.balagan.skip')}</Button>
    }

    if (step === 'speeches') {
      const started = day.opener !== null || day.spoken.length > 0 || speaking?.kind === 'speech' || speaking?.kind === 'silent'
      const next = day.waiting[0]
      /** В круге ещё никто не говорил. */
      const first = day.spoken.length === 0 && speaking?.kind !== 'speech' && speaking?.kind !== 'silent'
      // Доп. речи первых двоих: очередь появляется в День 1, когда в круге высказались все.
      const closingNext = day.closing.waiting[0]
      const closingNow = speaking?.kind === 'closing' ? speaking.seat : null
      const closingOrder = [...day.closing.done, ...(closingNow !== null ? [closingNow] : []), ...day.closing.waiting]
      if (!started) main = { label: t('day.pickOpener'), onPress: askOpener }
      else if (next !== undefined && day.silenced.includes(next)) {
        // Очередь молчащего: ход без речи и без таймера — слово к нему переходит, чтобы он мог выставить.
        main = { label: t('day.silent.turn', { n: next }), onPress: () => store.speak('silent', next) }
      } else if (next !== undefined) {
        main = { label: t(first ? 'day.give' : 'day.next', { n: next, sec: sec('speech') }), onPress: () => store.speak('speech', next) }
      } else if (closingNext !== undefined) {
        main = { label: t('day.closing', { n: closingNext, sec: sec('speech') }), onPress: () => store.speak('closing', closingNext) }
      } else if (!day.nominationsOpen) main = { label: t('day.toNight', { n: day.n }), onPress: () => store.dispatch(toNight) }
      else if (active.length > 0) main = { label: t('day.toDefense', { n: active.length }), onPress: () => go('defense') }
      else main = { label: t('day.noNominations', { n: day.n }), onPress: () => store.dispatch(toNight) }

      // Выставляет тот, чей сейчас ход: говорящий — или молчащий, если опция роли не запрещает ему выставлять.
      const speaker = speaking?.kind === 'speech' || (speaking?.kind === 'silent' && !day.silence.noNominate) ? speaking.seat : null
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
          {closingOrder.length > 0 && (
            <div className="closing-note">
              <span className="closing-note-title">{t(closingOrder.length > 1 ? 'day.closing.title' : 'day.closing.title.one')}</span>
              <span>{t(closingOrder.length > 1 ? 'day.closing.text' : 'day.closing.text.one', { seats: seatList(lang, closingOrder) })}</span>
            </div>
          )}
          <dl className="facts">
            <dt>{t('day.spoke')}</dt><dd>{day.spoken.join(' · ') || '—'}</dd>
            <dt>{t('day.waiting')}</dt><dd>{day.opener === null ? '—' : day.waiting.join(' · ') || '—'}</dd>
            {closingOrder.length > 0 && (
              <>
                <dt>{t('day.closing.fact')}</dt>
                <dd>{closingOrder.map((seat, i) => <span key={seat}>{i > 0 && ' · '}{seat === closingNow ? <strong>{seat}</strong> : seat}</span>)}</dd>
              </>
            )}
            {day.skipped.length > 0 && <><dt>{t('day.skipped')}</dt><dd>{day.skipped.join(' · ')}</dd></>}
            {day.previousOpener !== null && <><dt>{t('day.yesterday')}</dt><dd>{t('common.seat', { n: day.previousOpener })}</dd></>}
          </dl>
        </>
      )
      secondary = started && (
        <>
          {next !== undefined && <Button variant="outline" size="l" onClick={() => store.dispatch({ type: 'skipSpeaker', seat: next })}>{t('day.skipNext', { n: next })}</Button>}
          {next === undefined && closingNext !== undefined && (
            <Button variant="outline" size="l" onClick={() => skipIn('closing', closingNext)}>{t('day.closing.skip')}</Button>
          )}
          {/* Случайный выбор, по которому ещё никто не говорил, ведущий заменяет своим; дальше это уже новый круг. */}
          <Button variant="outline" size="l" onClick={askOpener}>{t((day.openerRandom || day.openerQueued) && first ? 'day.pickOther' : 'day.restart')}</Button>
        </>
      )
    }

    if (step === 'night_farewell' || step === 'defense' || step === 'tiebreak' || step === 'farewell') {
      // Ночное прощание говорится тем же видом речи, что и прощание выгнанного: тот же таймер и та же длительность.
      const kind = step === 'night_farewell' ? 'farewell' : step
      const queue = step === 'night_farewell' ? day.nightFarewell : day[step]
      const next = queue.waiting[0]
      const current = speaking?.kind === kind ? speaking.seat : null
      const order = [...queue.done, ...(current !== null ? [current] : []), ...queue.waiting]
      const going = queue.done.length > 0 || current !== null

      if (step === 'defense') {
        const only = active.length === 1 ? active[0] : undefined
        if (next !== undefined) main = { label: t(going ? 'day.next' : 'day.defense', { n: next, sec: sec('defense') }), onPress: () => store.speak('defense', next) }
        else if (only) {
          // Выставлен один: голосования нет, сразу прощание — или ночь, если прощание выключено правилами.
          // Игрок в целом жилете остаётся в игре: кнопка говорит об этом заранее, чтобы ведущий объявил столу.
          main = {
            label: sparedByVest(game, [only.target]).length > 0 ? t('day.single.vest', { n: only.target, night: day.n })
              : rules.farewellAfterVote ? t('day.single', { n: only.target, sec: sec('farewell') })
              : t('day.single.toNight', { n: only.target, night: day.n }),
            onPress: () => store.dispatchAll([
              { type: 'endSpeech' }, { type: 'resolveVote', ballot: 1, outcome: 'eliminated', seats: [only.target] }, afterExpelled(rules, day, game, [only.target]),
            ]),
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
      if (step === 'night_farewell') {
        // После прощаний день идёт своим чередом: балаган, а если его нет — круг речей (начинающего спросят, если он не выбран).
        main = next !== undefined
          ? { label: t('day.farewell', { n: next, sec: sec('farewell') }), onPress: () => store.speak('farewell', next) }
          : balaganInDay(rules, day.n) ? { label: t('day.toBalagan'), onPress: () => go('balagan') }
          : { label: toCircleLabel, onPress: toCircle }
      }
      if (step === 'farewell') {
        main = next !== undefined
          ? { label: t('day.farewell', { n: next, sec: sec('farewell') }), onPress: () => store.speak('farewell', next) }
          : { label: t('day.toNight', { n: day.n }), onPress: () => store.dispatch(toNight) }
      }

      const title = step === 'farewell' && order.length > 0 ? t('day.farewell.title', { seats: seatList(lang, order) })
        : step === 'night_farewell' && order.length > 0 ? t(order.length > 1 ? 'day.nightFarewell.title.many' : 'day.nightFarewell.title.one', { seats: seatList(lang, order) })
        : step === 'tiebreak' && order.length > 0 ? t('day.tie.title', { seats: seatList(lang, order) })
        : null
      body = (
        <>
          {title && <p className="speech-title">{title}</p>}
          {step === 'farewell' && day.spared.length > 0 && (
            <p className="step-warning" role="status">{t(day.spared.length > 1 ? 'day.spared.many' : 'day.spared.one', { seats: seatList(lang, day.spared) })}</p>
          )}
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
        secondary = <Button variant="outline" size="l" onClick={() => skipIn(kind, next)}>{t('day.skipNext', { n: next })}</Button>
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
