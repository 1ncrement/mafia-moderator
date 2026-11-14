import { phaseLabel, translate, translateKey } from '../../app/i18n'
import type { Lang } from '../../app/i18n'
import { SUMMARY_STEP } from '../../engine'
import type { GameState, JournalEntry, NightState, PlayerView, Registry, Seat } from '../../engine'

/** Название ночного шага: «Мафия», «Доктор №4», «Итог ночи». */
export function nightStepLabel(lang: Lang, registry: Registry, night: NightState | null, stepId: string): string {
  if (stepId === SUMMARY_STEP) return translate(lang, 'step.summary')
  const step = night?.steps.find((s) => s.id === stepId)
  if (!night || !step) return stepId
  const def = registry.nightActions.find((a) => a.id === step.actionId)
  const base = def ? translateKey(lang, def.stepKey) : step.actionId
  const several = night.steps.filter((s) => s.actionId === step.actionId).length > 1
  return several && step.actor !== null ? `${base} ${translate(lang, 'common.seat', { n: step.actor })}` : base
}

/** Название текущего шага для шапки и шторки паузы. */
export function stepLabel(lang: Lang, registry: Registry, game: GameState): string {
  if (!game.phase || game.step === null) return ''
  if (game.phase.kind === 'day') return translateKey(lang, `step.${game.step}`)
  if (game.phase.kind === 'night') return nightStepLabel(lang, registry, game.night, game.step)
  return ''
}

/** «застрелен · Ночь 1», «выгнан · День 2»; у игрока в игре — null. */
export function statusText(lang: Lang, player: PlayerView): string | null {
  if (player.status === 'alive') return null
  const cause = translate(lang, player.cause === 'shot' ? 'status.shot' : player.cause === 'voted' ? 'status.voted' : 'status.out')
  return player.outPhase ? `${cause} · ${phaseLabel(lang, player.outPhase)}` : cause
}

/** Упоминается ли номер в записи журнала — для панели игрока. */
export function entryMentions(entry: JournalEntry, seat: Seat): boolean {
  switch (entry.kind) {
    case 'night_action': return entry.actor === seat || entry.target === seat
    case 'night_missing': return entry.actor === seat
    case 'night_result': return entry.dies === seat
    case 'circle': return entry.first === seat
    case 'nomination': return entry.by === seat || entry.target === seat
    case 'votes': return entry.entries.some((e) => e.candidate === seat)
    case 'vote_result': return entry.seats.includes(seat)
    case 'status': return entry.seat === seat
    case 'swap': return entry.a === seat || entry.b === seat
    default: return false
  }
}
