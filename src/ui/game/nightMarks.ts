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
  // Цель нападения помечена, даже если оно не состоялось (блок) или цель вылечили. У действия может быть своя метка («цель мясника»).
  const targetMark = (actionId: string, effect: string) => (hasKey(`action.${actionId}.target`) ? translateKey(lang, `action.${actionId}.target`) : mark(effect))
  const attacked = new Map<string, Seat>()
  for (const s of night.steps) if (s.effect === 'kill' && s.target !== null) attacked.set(`${s.target}:${targetMark(s.actionId, s.effect)}`, s.target)
  for (const [key, seat] of attacked) add(seat, key.slice(key.indexOf(':') + 1))
  for (const seat of night.outcome.blocked) add(seat, mark('block'), 'block')
  for (const seat of night.outcome.healed) add(seat, mark('heal'))
  // Запись своей роли в итог ночи не входит: метка только называет, чей это выбор.
  // У роли с несколькими носителями в метке есть номер носителя, как в названии шага: «выбор: журналист №6».
  for (const step of night.steps) {
    if (step.effect !== 'note' || step.target === null) continue
    const several = step.actor !== null && night.steps.filter((x) => x.actionId === step.actionId).length > 1
    const role = roleName(lang, registry, step.performerRole)
    add(step.target, translate(lang, 'night.mark.note', { role: several ? `${role} ${translate(lang, 'common.seat', { n: step.actor as Seat })}` : role }))
  }
  return marks
}
