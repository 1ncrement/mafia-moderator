import { hasKey, roleName, translate, translateKey } from '../../app/i18n'
import type { Lang } from '../../app/i18n'
import type { NightState, Registry, Seat } from '../../engine'
import type { SeatMark } from './tableMarks'

/**
 * Ночные метки на карточках: цель выстрела, заблокирован, вылечен, выбор своей роли.
 * Видны ночью и на итоге ночи, утром снимаются.
 */
export function nightMarks(lang: Lang, registry: Registry, night: NightState, acting: Seat[] = []): Record<Seat, SeatMark[]> {
  const marks: Record<Seat, SeatMark[]> = {}
  const add = (seat: Seat, text: string, tone: SeatMark['tone'] = 'night') => {
    marks[seat] = [...(marks[seat] ?? []), { text, tone }]
  }
  for (const seat of acting) add(seat, translate(lang, 'night.mark.acting'))
  const mark = (effect: string) => (hasKey(`effect.${effect}.mark`) ? translateKey(lang, `effect.${effect}.mark`) : effect)
  if (night.outcome.shotAt !== null) add(night.outcome.shotAt, mark('kill'))
  for (const seat of night.outcome.blocked) add(seat, mark('block'))
  for (const seat of night.outcome.healed) add(seat, mark('heal'))
  // Запись своей роли в итог ночи не входит: метка только называет, чей это выбор.
  for (const step of night.steps) {
    if (step.effect !== 'note' || step.target === null) continue
    add(step.target, translate(lang, 'night.mark.note', { role: roleName(lang, registry, step.performerRole) }))
  }
  return marks
}
