import { hasKey, phaseLabel, stepName, translate, translateKey } from '../../app/i18n'
import type { Lang } from '../../app/i18n'
import { SUMMARY_STEP } from '../../engine'
import type { GameState, JournalEntry, NightState, PlayerView, Registry, Seat } from '../../engine'

/** Название ночного шага: «Мафия», «Доктор №4», «Итог ночи». */
export function nightStepLabel(lang: Lang, registry: Registry, night: NightState | null, stepId: string, hideSeats = false): string {
  if (stepId === SUMMARY_STEP) return translate(lang, 'step.summary')
  const step = night?.steps.find((s) => s.id === stepId)
  if (!night || !step) return stepId
  const def = registry.nightActions.find((a) => a.id === step.actionId)
  const base = def ? stepName(lang, registry, def) : step.actionId
  const several = night.steps.filter((s) => s.actionId === step.actionId).length > 1
  // Номер носителя выдаёт роль: при скрытых ролях его в подписи нет.
  return several && step.actor !== null && !hideSeats ? `${base} ${translate(lang, 'common.seat', { n: step.actor })}` : base
}

/** Название текущего шага для шапки и шторки паузы. */
export function stepLabel(lang: Lang, registry: Registry, game: GameState, hideSeats = false): string {
  if (!game.phase || game.step === null) return ''
  if (game.phase.kind === 'day') return translateKey(lang, `step.${game.step}`)
  if (game.phase.kind === 'night') return nightStepLabel(lang, registry, game.night, game.step, hideSeats)
  return ''
}

/**
 * «застрелен · Ночь 1», «убит мясником · Ночь 2», «выгнан · День 2»; у игрока в игре — null.
 * hideCause — роли скрыты: причина ночной смерти выдала бы, чьих рук это дело, поэтому вместо неё «выбыл».
 * Изгнание голосованием знает весь стол — оно подписано всегда.
 */
export function statusText(lang: Lang, player: PlayerView, hideCause = false): string | null {
  if (player.status === 'alive') return null
  const key = `status.${player.cause ?? ''}`
  const cause = hasKey(key) && (!hideCause || player.cause === 'voted') ? translateKey(lang, key) : translate(lang, 'status.out')
  return player.outPhase ? `${cause} · ${phaseLabel(lang, player.outPhase)}` : cause
}

/** Упоминается ли номер в записи журнала — для панели игрока. */
export function entryMentions(entry: JournalEntry, seat: Seat): boolean {
  switch (entry.kind) {
    case 'night_action': return entry.actor === seat || entry.target === seat
    case 'night_missing': return entry.actor === seat
    case 'night_result': return entry.died.includes(seat)
    case 'circle': return entry.first === seat
    case 'nomination': return entry.by === seat || entry.target === seat
    case 'votes': return entry.entries.some((e) => e.candidate === seat)
    case 'vote_result': return entry.seats.includes(seat)
    case 'status': return entry.seat === seat
    case 'vest': return entry.seat === seat
    case 'swap': return entry.a === seat || entry.b === seat
    default: return false
  }
}
