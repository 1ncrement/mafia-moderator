import { hasKey, translate, translateKey } from '../../app/i18n'
import type { Lang } from '../../app/i18n'
import type { NightState, Seat } from '../../engine'
import type { SeatMark } from './tableMarks'

/** Ночные метки на карточках: цель выстрела, заблокирован, вылечен. Видны ночью и на итоге ночи, утром снимаются. */
export function nightMarks(lang: Lang, night: NightState, acting: Seat[] = []): Record<Seat, SeatMark[]> {
  const marks: Record<Seat, SeatMark[]> = {}
  const add = (seat: Seat, text: string, tone: SeatMark['tone'] = 'night') => {
    marks[seat] = [...(marks[seat] ?? []), { text, tone }]
  }
  for (const seat of acting) add(seat, translate(lang, 'night.mark.acting'))
  const mark = (effect: string) => (hasKey(`effect.${effect}.mark`) ? translateKey(lang, `effect.${effect}.mark`) : effect)
  if (night.outcome.shotAt !== null) add(night.outcome.shotAt, mark('kill'))
  for (const seat of night.outcome.blocked) add(seat, mark('block'))
  for (const seat of night.outcome.healed) add(seat, mark('heal'))
  return marks
}
