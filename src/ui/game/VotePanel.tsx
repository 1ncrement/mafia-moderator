import { useState } from 'react'
import { seatList } from '../../app/i18n'
import { useApp, useLang, useStore, useT } from '../../app/StoreContext'
import { enteredVotes, maxVotesFor } from '../../engine'
import type { Command, GameState, Seat } from '../../engine'
import { Button, cx } from '../common/Button'
import { Stepper } from '../common/Stepper'
import { afterExpelled, aliveOf, sparedByVest } from './dayFlow'
import { useDigitKeys } from './digitKeys'
import { useMainAction } from './MainButton'
import type { MainAction } from './MainButton'
import { useAskOnce } from './selection'
import { useTableMarks } from './tableMarks'
import type { SeatMark } from './tableMarks'
import { TieDecision } from './TieDecision'

/**
 * Голосование и переголосование. Ведущий записывает только число голосов за каждого кандидата;
 * кнопок больше остатка нет — превысить число голосующих нельзя.
 */
export function VotePanel({ game }: { game: GameState }) {
  const { session } = useApp()
  const store = useStore()
  const t = useT()
  const lang = useLang()
  const askOnce = useAskOnce()
  /** Кандидат, число которого ведущий правит по клику на строку. */
  const [editing, setEditing] = useState<Seat | null>(null)
  const [votersOpen, setVotersOpen] = useState(false)
  const day = game.day
  const n = game.step === 'revote' ? 2 : 1
  const ballot = day?.ballots[n - 1]
  const first = day?.ballots[0]

  const current = ballot ? (editing !== null && ballot.candidates.includes(editing) ? editing : ballot.entries.find((e) => e.count === null)?.candidate ?? null) : null
  const max = ballot && current !== null ? maxVotesFor(ballot, current) : 0
  const put = (count: number) => {
    if (!ballot || current === null || count > max) return
    if (store.dispatch({ type: 'setVotes', ballot: ballot.n, candidate: current, count }).ok) setEditing(null)
  }
  // Набор «10» по клавишам записал бы «1» одному кандидату и «0» следующему: при остатке от 10 цифры молчат.
  const digits = ballot !== undefined && current !== null && max <= 9
  useDigitKeys(digits ? put : null)

  // На карточках кандидатов: число голосов, «считаем сейчас», «получит остаток».
  const marks: Record<Seat, SeatMark[]> = {}
  if (ballot) {
    const last = ballot.entries.at(-1)
    for (const e of ballot.entries) {
      marks[e.candidate] = e.candidate === current ? [{ text: t('vote.now'), tone: 'day' }]
        : e.count !== null ? [{ text: t('card.votes', { n: e.count }), tone: 'plain' }]
        : e === last ? [{ text: t('vote.mark.rest'), tone: 'plain' }]
        : []
    }
  }
  useTableMarks(marks, current)

  const durations = session?.config.durations
  const rules = session?.config.rules
  const toNight: Command | null = day ? { type: 'startPhase', phase: { kind: 'night', n: day.n } } : null
  const decides = ballot !== undefined && ballot.n === 2 && ballot.complete && current === null && (ballot.hint?.outcome === 'tie' || ballot.voters === 0)
  let main: MainAction = null
  // Голосов введено больше, чем голосующих, — исход по такой таблице не подтверждается: сначала исправить числа.
  if (day && ballot && durations && rules && toNight && ballot.complete && !ballot.overflow && current === null && ballot.hint && !decides) {
    const { outcome, seats } = ballot.hint
    main = outcome === 'eliminated'
      ? {
        // Прощание выключено правилами партии — выгнанный уходит без слова, сразу ночь.
        // Лидер в целом жилете остаётся в игре — кнопка говорит об этом заранее.
        label: sparedByVest(game, seats).length > 0 ? t('day.single.vest', { n: seats[0] ?? 0, night: day.n })
          : rules.farewellAfterVote ? t('day.single', { n: seats[0] ?? 0, sec: t('unit.sec', { n: durations.farewell }) })
          : t('day.single.toNight', { n: seats[0] ?? 0, night: day.n }),
        onPress: () => store.dispatchAll([{ type: 'resolveVote', ballot: ballot.n, outcome: 'eliminated', seats }, afterExpelled(rules, day, game, seats)]),
      }
      : {
        label: t('vote.tie', { seats: seatList(lang, seats), sec: t('unit.sec', { n: durations.tiebreak }) }),
        onPress: () => store.dispatchAll([{ type: 'resolveVote', ballot: ballot.n, outcome: 'tie', seats }, { type: 'enterStep', step: 'tiebreak' }]),
      }
  } else if (day && !ballot && toNight) {
    main = { label: t('day.noNominations', { n: day.n }), onPress: () => store.dispatch(toNight) }
  }
  useMainAction(main)

  if (!day || !toNight || !rules) return null
  if (!ballot) return <p className="muted">{t('vote.none')}</p>

  // Кто сегодня не голосует: молчащие, если так задано опцией; ничейные в переголосовании не голосуют и так.
  const muted = day.silence.noVote ? day.silenced.filter((seat) => !(ballot.n === 2 && ballot.candidates.includes(seat))) : []
  const expelOther = () => askOnce({
    question: t('vote.other.question'), allowed: aliveOf(game),
    onPick: (seat) => {
      if (seat !== null) store.dispatchAll([{ type: 'resolveVote', ballot: ballot.n, outcome: 'eliminated', seats: [seat] }, afterExpelled(rules, day, game, [seat])])
    },
  })
  const lastEntry = ballot.entries.at(-1)

  return (
    <div className="vote">
      {ballot.n === 2 && first && (
        <div className="vote-first">
          <span className="small muted">{t('vote.first', { n: first.voters })}</span>
          <div className="vote-first-grid">
            {first.entries.map((e) => (
              <div key={e.candidate} className={cx('vote-first-cell', ballot.candidates.includes(e.candidate) && 'vote-first-tie')}>
                <span>{t('common.seat', { n: e.candidate })}</span><span className="num">{e.count ?? '—'}</span>
              </div>
            ))}
          </div>
          <span>{t('vote.tieWas', { seats: seatList(lang, ballot.candidates) })}</span>
          <span className="small muted">{t('vote.second', { n: ballot.voters, seats: seatList(lang, ballot.candidates) })}</span>
        </div>
      )}

      <ol className="vote-list" aria-label={t('vote.candidates')}>
        {ballot.entries.map((e) => {
          const isCurrent = e.candidate === current
          const note = isCurrent ? t('vote.now')
            : e.count === null ? (e === lastEntry ? t('vote.rest') : '')
            : e.auto ? (e.count > 0 || e === lastEntry ? t('vote.rest.auto') : t('vote.zero.auto'))
            : t('vote.change')
          return (
            <li key={e.candidate}>
              <button type="button" className={cx('vote-row', isCurrent && 'vote-row-now', e.count === null && !isCurrent && 'vote-row-wait')} onClick={() => setEditing(e.candidate)}>
                <span className="vote-row-seat">{t('common.seat', { n: e.candidate })}</span>
                <span className="vote-row-note">{note}</span>
                {e.count !== null && <span className="vote-row-count num">{e.count}</span>}
              </button>
            </li>
          )
        })}
      </ol>

      {current !== null && (
        <div className="vote-ask">
          <div className="vote-ask-head">
            <span className="vote-question">{t('vote.question', { n: current })}</span>
            <span className="muted">{t('vote.counter', { voters: ballot.voters, left: ballot.remaining })}</span>
          </div>
          <div className="vote-buttons" role="group" aria-label={t('vote.count')}>
            {Array.from({ length: max + 1 }, (_, count) => (
              <button key={count} type="button" className="vote-button num" onClick={() => put(count)}>{count}</button>
            ))}
          </div>
          <span className="small muted">{t('vote.hint')}{digits && ` ${t('vote.hint.keys')}`}</span>
        </div>
      )}
      {current === null && <span className="muted">{t('vote.counter', { voters: ballot.voters, left: ballot.remaining })}</span>}
      {/* Опция роли: молчащие сегодня не голосуют — число голосующих по умолчанию уже без них. */}
      {muted.length > 0 && <span className="small muted">{t(muted.length > 1 ? 'vote.muted.many' : 'vote.muted.one', { seats: seatList(lang, muted) })}</span>}
      {ballot.overflow && <p className="alert-line" role="alert">{t('vote.overflow')}</p>}

      <div className="speech-secondary">
        <Button size="l" onClick={() => { setEditing(null); store.dispatch({ type: 'resetVotes', ballot: ballot.n }) }}>{t('vote.reset')}</Button>
        <Button size="l" aria-expanded={votersOpen} onClick={() => setVotersOpen(!votersOpen)}>{t('vote.voters', { n: ballot.voters })}</Button>
      </div>
      {votersOpen && (
        <div className="vote-voters">
          <span>{t('vote.voters.label')}</span>
          <Stepper
            value={ballot.voters} min={enteredVotes(ballot)} max={game.counts.alive}
            lessLabel={t('stepper.less', { name: t('vote.voters.label') })} moreLabel={t('stepper.more', { name: t('vote.voters.label') })}
            onChange={(count) => store.dispatch({ type: 'setVoters', ballot: ballot.n, count })}
          />
        </div>
      )}

      {decides
        ? <TieDecision game={game} day={day} ballot={ballot} rules={rules} />
        : (
          <>
            {!ballot.complete && <p className="vote-pending">{t('vote.pending')}</p>}
            <div className="speech-secondary">
              <Button size="l" variant="outline" onClick={() => store.dispatchAll([{ type: 'resolveVote', ballot: ballot.n, outcome: 'nobody', seats: [] }, toNight])}>
                {t('day.nobodyOut', { n: day.n })}
              </Button>
              <Button size="l" variant="outline" onClick={expelOther}>{t('vote.other')}</Button>
            </div>
          </>
        )}
    </div>
  )
}
