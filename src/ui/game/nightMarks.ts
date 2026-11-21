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
  // Цель помечена, даже если действие не состоялось (блок) или цель спасли. У действия может быть своя метка
  // («цель мясника», «визит маньяка»); у нападения без своей метки — общая.
  const targetMark = (actionId: string, effect: string): string | null =>
    (hasKey(`action.${actionId}.target`) ? translateKey(lang, `action.${actionId}.target`) : effect === 'kill' ? mark(effect) : null)
  const targeted = new Map<string, Seat>()
  for (const s of night.steps) {
    const text = s.target === null ? null : targetMark(s.actionId, s.effect)
    // У действия с двумя целями помечены обе.
    for (const seat of [s.target, s.target2]) if (seat !== null && text !== null) targeted.set(`${seat}:${text}`, seat)
  }
  for (const [key, seat] of targeted) add(seat, key.slice(key.indexOf(':') + 1))
  for (const seat of night.outcome.blocked) add(seat, mark('block'), 'block')
  // Выбор защитника — на его собственной карточке: «защищает №5».
  for (const s of night.steps) {
    if (s.effect === 'guard' && s.target !== null && s.actor !== null) add(s.actor, translate(lang, 'effect.guard.mark', { target: translate(lang, 'common.seat', { n: s.target }) }))
  }
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
