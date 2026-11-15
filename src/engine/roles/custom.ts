import type { CustomRole, NightActionDef, Registry, RoleDef, RoleId } from '../types'

// Свои роли ведущего. Справочник собирается на лету: встроенный плюс роли, которые пришли данными.
// Движок по-прежнему получает справочник параметром и не знает, откуда в нём роли.

export const MAX_CUSTOM_ROLES = 8
export const MAX_ROLE_NAME = 24
/** С этого места в ночном порядке идут шаги своих ролей — после всех встроенных. */
const FIRST_CUSTOM_ORDER = 100

/** Название роли: без пробелов по краям и не длиннее MAX_ROLE_NAME знаков. */
export function cleanRoleName(name: string): string {
  // Обрезка по знакам, а не по кодовым единицам: половинка суррогатной пары в названии не остаётся.
  return [...name.trim()].slice(0, MAX_ROLE_NAME).join('').trimEnd()
}

/** Идентификатор ночного действия своей роли. Без «:» — на нём делится идентификатор шага. */
export function customActionId(roleId: RoleId): string {
  return `act_${roleId}`
}

/** Годные записи перечня своих ролей: негодные пропускаются, лишние сверх предела отбрасываются. */
export function sanitizeCustomRoles(base: Registry, input: unknown): CustomRole[] {
  if (!Array.isArray(input)) return []
  const takenIds = new Set(base.roles.map((r) => r.id))
  const actionIds = new Set(base.nightActions.map((a) => a.id))
  const sides = new Set(base.sides.map((s) => s.id))
  const roles: CustomRole[] = []
  for (const item of input as unknown[]) {
    if (roles.length >= MAX_CUSTOM_ROLES) break
    if (typeof item !== 'object' || item === null) continue
    const { id, name, side, night } = item as Record<string, unknown>
    if (typeof id !== 'string' || id === '' || id.includes(':') || takenIds.has(id) || actionIds.has(customActionId(id))) continue
    if (typeof name !== 'string' || typeof side !== 'string' || !sides.has(side) || typeof night !== 'boolean') continue
    const clean = cleanRoleName(name)
    if (clean === '') continue
    takenIds.add(id)
    roles.push({ id, name: clean, side, night })
  }
  return roles
}

const cache = new WeakMap<Registry, WeakMap<readonly CustomRole[], Registry>>()

/**
 * Справочник со своими ролями: они стоят после встроенных, ночная роль получает действие «запись»
 * в конце ночной очереди, в порядке перечня. Без своих ролей возвращается сам base.
 * Результат запоминается по массиву: тот же перечень — тот же объект справочника.
 */
export function registryFor(base: Registry, custom: readonly CustomRole[] | undefined): Registry {
  if (!Array.isArray(custom) || custom.length === 0) return base
  let byList = cache.get(base)
  if (!byList) cache.set(base, (byList = new WeakMap()))
  const known = byList.get(custom)
  if (known) return known

  const list = sanitizeCustomRoles(base, custom)
  const firstOrder = Math.max(FIRST_CUSTOM_ORDER, ...base.nightActions.map((a) => a.order + 1))
  const roles: RoleDef[] = list.map((role) => ({
    id: role.id, nameKey: '', name: role.name, side: role.side, defaultCount: 0, seenBySheriffAs: role.side, custom: true,
  }))
  const actions: NightActionDef[] = list.flatMap((role, index) => (role.night
    ? [{ id: customActionId(role.id), order: firstOrder + index, effect: 'note' as const, performers: [role.id], scope: 'each' as const, stepKey: '', questionKey: '' }]
    : []))
  const registry: Registry = list.length === 0
    ? base
    : { sides: base.sides, roles: [...base.roles, ...roles], nightActions: [...base.nightActions, ...actions] }
  byList.set(custom, registry)
  return registry
}
