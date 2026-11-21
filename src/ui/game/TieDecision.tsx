import { seatList } from '../../app/i18n'
import { useLang, useStore, useT } from '../../app/StoreContext'
import type { Ballot, Command, DayState, GameState, Rules } from '../../engine'
import { afterExpelled } from './dayFlow'
import { useAskOnce } from './selection'

/** Вторая ничья (или голосовать некому): исход приложение не предлагает, решает ведущий. Три равные кнопки без главной. */
export function TieDecision({ game, day, ballot, rules }: { game: GameState; day: DayState; ballot: Ballot; rules: Rules }) {
  const store = useStore()
  const t = useT()
  const lang = useLang()
  const askOnce = useAskOnce()
  const seats = ballot.hint?.seats ?? ballot.candidates
  const toNight: Command = { type: 'startPhase', phase: { kind: 'night', n: day.n } }
  const expel = (who: number[]) =>
    store.dispatchAll([{ type: 'resolveVote', ballot: ballot.n, outcome: 'eliminated', seats: who }, afterExpelled(rules, day, game, who)])

  return (
    <div className="tie">
      <div className="tie-banner">
        <span className="tie-title num">{ballot.voters === 0 ? t('vote.noVoters') : t('vote.again')}</span>
        <span className="tie-hint">{t('vote.again.hint')}</span>
      </div>
      <button type="button" className="btn-decision" onClick={() => askOnce({
        question: t('vote.other.question'), allowed: seats,
        onPick: (seat) => {
          if (seat !== null) expel([seat])
        },
      })}>{t('vote.expelOne')}</button>
      <button type="button" className="btn-decision" onClick={() => expel(seats)}>
        {t(seats.length === 2 ? 'vote.expelBoth' : 'vote.expelAll', { seats: seatList(lang, seats) })}
      </button>
      <button type="button" className="btn-decision" onClick={() => store.dispatchAll([{ type: 'resolveVote', ballot: ballot.n, outcome: 'nobody', seats: [] }, toNight])}>
        {t('day.nobodyOut', { n: day.n })}
      </button>
      <button type="button" className="btn btn-ghost tie-again" onClick={() => store.dispatch({ type: 'resetVotes', ballot: ballot.n })}>{t('vote.revoteAgain')}</button>
    </div>
  )
}
