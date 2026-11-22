import type { NightActionDef, PhaseRef, Registry, RoleDef, RoleId, Seat } from '../../engine'
import type { Lang } from '../../platform/storage'
import { ru } from './ru'
import { uk } from './uk'

export type { Lang } from '../../platform/storage'
export type Dict = typeof ru
export type TKey = keyof Dict
export type Params = Record<string, string | number>

const DICTS: Record<Lang, Dict> = { ru, uk }
/** Языки интерфейса. */
export const LANGS = Object.keys(DICTS) as Lang[]

const fill = (text: string, params?: Params) =>
  params ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole)) : text

/** Строка по ключу словаря с подстановкой {n}. */
export function translate(lang: Lang, key: TKey, params?: Params): string {
  return fill(DICTS[lang][key], params)
}

/** Для ключей из справочника ролей: есть ли такая строка. */
export function hasKey(key: string): key is TKey {
  return Object.hasOwn(ru, key)
}

/** Строка по ключу из справочника; неизвестный ключ возвращается как есть. */
export function translateKey(lang: Lang, key: string, params?: Params): string {
  return hasKey(key) ? translate(lang, key, params) : fill(key, params)
}

export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** «Распределение», «День 2», «Ночь 1». */
export function phaseLabel(lang: Lang, phase: PhaseRef): string {
  if (phase.kind === 'deal') return translate(lang, 'phase.deal')
  return translate(lang, phase.kind === 'day' ? 'phase.day' : 'phase.night', { n: phase.n })
}

/** Форма числительного: 1 игрок, 2 игрока, 5 игроков; 3 фола, 6 фолов. */
export function plural(lang: Lang, n: number, base: 'players' | 'votes' | 'fouls'): string {
  const d = n % 10, h = n % 100
  const form = d === 1 && h !== 11 ? 'one' : d >= 2 && d <= 4 && (h < 12 || h > 14) ? 'few' : 'many'
  return translate(lang, `${base}.${form}`, { n })
}

/** «№10 и №4», «№2, №3 и №4». */
export function seatList(lang: Lang, seats: Seat[]): string {
  const names = seats.map((n) => translate(lang, 'common.seat', { n }))
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} ${translate(lang, 'common.and')} ${names.at(-1)}`
}

/**
 * Название своей роли по образцу встроенных — со строчной буквы: «Журналист» → «журналист».
 * Аббревиатура («КГБ», вторая буква прописная) остаётся как есть.
 */
export function lowerFirst(name: string): string {
  const [first = '', second = ''] = [...name]
  if (second !== second.toLowerCase()) return name
  return first.toLowerCase() + name.slice(first.length)
}

/**
 * Название роли, как оно стоит внутри фразы и на карточке: у встроенной — из словаря, у своей — то, что ввёл ведущий,
 * со строчной буквы. Там, где название начинает строку, его поднимает cap.
 */
export function roleTitle(lang: Lang, def: RoleDef): string {
  return def.name !== undefined ? lowerFirst(def.name) : translateKey(lang, def.nameKey)
}

/** Название роли на столе: роль с displayAs показана названием этой роли и пометкой markKey. */
export function roleLabel(lang: Lang, registry: Registry, roleId: RoleId): { name: string; mark: string | null; note: string | null } {
  const def = registry.roles.find((r) => r.id === roleId)
  const shown = (def?.displayAs && registry.roles.find((r) => r.id === def.displayAs)) || def
  const noteKey = def ? `${def.nameKey}.note` : ''
  return {
    name: shown ? roleTitle(lang, shown) : roleId,
    mark: def?.markKey ? translateKey(lang, def.markKey) : null,
    note: hasKey(noteKey) ? translate(lang, noteKey) : null,
  }
}

/** «мафия · глава». */
export function roleText(lang: Lang, registry: Registry, roleId: RoleId): string {
  const { name, mark } = roleLabel(lang, registry, roleId)
  return mark ? `${name} · ${mark}` : name
}

/** Собственное название роли, без displayAs: «крёстный отец». */
export function roleName(lang: Lang, registry: Registry, roleId: RoleId): string {
  const def = registry.roles.find((r) => r.id === roleId)
  return def ? roleTitle(lang, def) : roleId
}

/** Название ночного шага без номера носителя: «Мафия», «Журналист». У своей роли строки в словаре нет — шаг назван ролью. */
export function stepName(lang: Lang, registry: Registry, def: NightActionDef): string {
  return hasKey(def.stepKey) ? translate(lang, def.stepKey) : cap(roleName(lang, registry, def.performers[0] ?? ''))
}

/** Вопрос шага над столом: «В кого стреляет мафия?», «Кого выбирает журналист?». */
export function stepQuestion(lang: Lang, registry: Registry, def: NightActionDef, performerRole: RoleId, inherited: boolean): string {
  const role = roleName(lang, registry, performerRole)
  const inheritedKey = `${def.questionKey}.inherited`
  if (inherited && hasKey(inheritedKey)) return translate(lang, inheritedKey, { role })
  return hasKey(def.questionKey) ? translate(lang, def.questionKey) : translate(lang, 'night.custom.question', { role })
}

/**
 * Состав одной строкой: «мафия 2 (из них крёстный отец 1), проститутка 1, шериф 1, доктор 1, мирных 6».
 * counts — число карт каждой роли.
 */
export function compositionText(lang: Lang, registry: Registry, counts: Record<RoleId, number>): string {
  const parts: string[] = []
  // Остаток (мирные) называется последним.
  const roles = [...registry.roles].sort((a, b) => Number(a.filler ?? false) - Number(b.filler ?? false))
  for (const role of roles) {
    if (role.countsWithin) continue
    const nested = registry.roles.filter((r) => r.countsWithin === role.id && (counts[r.id] ?? 0) > 0)
    const total = (counts[role.id] ?? 0) + nested.reduce((sum, r) => sum + (counts[r.id] ?? 0), 0)
    if (total === 0) continue
    const countKey = `${role.nameKey}.count`
    let text = hasKey(countKey) ? translate(lang, countKey, { n: total }) : `${roleTitle(lang, role)} ${total}`
    if (nested.length > 0) {
      const inner = nested.map((r) => translate(lang, 'journal.nested', { role: roleTitle(lang, r), n: counts[r.id] ?? 0 }))
      text += ` (${inner.join(', ')})`
    }
    parts.push(text)
  }
  return parts.join(', ')
}

export { answerText, entryText, journalAsText, summaryBody, summaryText } from './journalText'
