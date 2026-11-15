import { cleanRoleName } from '../engine'
import type { CustomRole, Registry, RoleId, SideId } from '../engine'
import { hasKey, LANGS, translate } from './i18n'

// Проверка названия своей роли: что ввёл ведущий и какие названия уже заняты.

export { cleanRoleName } from '../engine'

export type RoleInput = { name: string; side: SideId; night: boolean }
export type RoleIssue = 'empty' | 'duplicate' | 'limit'

const key = (name: string) => name.toLowerCase()

/**
 * Названия, занятые другими ролями: свои (кроме exceptId) и встроенные на обоих языках, в нижнем регистре.
 * У встроенной роли занято всё, чем она подписана на экране: «мирный житель», «мирные жители», «мирные».
 */
export function takenNames(base: Registry, custom: readonly CustomRole[], exceptId?: RoleId): Set<string> {
  const taken = new Set<string>()
  for (const role of custom) if (role.id !== exceptId) taken.add(key(role.name))
  for (const role of base.roles) {
    for (const nameKey of [role.nameKey, `${role.nameKey}.many`, `${role.nameKey}.short`]) {
      if (hasKey(nameKey)) for (const lang of LANGS) taken.add(key(translate(lang, nameKey)))
    }
  }
  return taken
}

/** null — название годится. Сравнение без учёта регистра, после обрезки. */
export function checkRoleName(name: string, taken: ReadonlySet<string>): 'empty' | 'duplicate' | null {
  const clean = cleanRoleName(name)
  if (clean === '') return 'empty'
  return taken.has(key(clean)) ? 'duplicate' : null
}
