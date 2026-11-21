import { blackNotLess } from './roles/rules'
import type { Durations, NightActionDef, Registry, RoleDef, RoleId, RoleOptionDef, Rules, Session, SessionConfig, SideId } from './types'

export const MIN_PLAYERS = 4
export const MAX_PLAYERS = 20

export type SetupIssue = 'players_out_of_range' | 'too_many_roles' | 'no_killer' | 'black_not_less_than_red'

/** Роли, количество которых ведущий задаёт сам: не остаток и не часть другой роли. */
export function configurableRoles(registry: Registry): RoleDef[] {
  return registry.roles.filter((r) => !r.filler && !r.countsWithin)
}

/** Роли, которые считаются внутри счётчика данной роли (крёстный отец внутри мафии). */
export function nestedRoles(registry: Registry, parent: RoleId): RoleDef[] {
  return registry.roles.filter((r) => r.countsWithin === parent)
}

/** Состав по умолчанию. Сюда позже лягут схемы «число игроков → состав». */
export function defaultComposition(registry: Registry): Record<RoleId, number> {
  return Object.fromEntries(configurableRoles(registry).map((r) => [r.id, r.defaultCount]))
}

const wholeCount = (n: number | undefined) => (Number.isFinite(n) ? Math.max(0, Math.floor(n as number)) : 0)

export function checkComposition(
  playerCount: number,
  composition: Record<RoleId, number>,
  registry: Registry,
): { errors: SetupIssue[]; warnings: SetupIssue[]; deck: RoleId[]; civilians: number; bySide: Record<SideId, number> } {
  const errors: SetupIssue[] = []
  const warnings: SetupIssue[] = []

  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    errors.push('players_out_of_range')
  }

  // Колода ровно по составу: вложенные роли забирают свою долю из счётчика родителя.
  const deck: RoleId[] = []
  for (const role of configurableRoles(registry)) {
    let left = wholeCount(composition[role.id])
    for (const nested of nestedRoles(registry, role.id)) {
      const take = Math.min(nested.exactCount ?? 0, left)
      for (let i = 0; i < take; i++) deck.push(nested.id)
      left -= take
    }
    for (let i = 0; i < left; i++) deck.push(role.id)
  }

  const filler = registry.roles.find((r) => r.filler)
  const civilians = Math.max(0, playerCount - deck.length)
  if (deck.length > playerCount) errors.push('too_many_roles')
  else if (filler) for (let i = 0; i < civilians; i++) deck.push(filler.id)

  const sideOf = new Map(registry.roles.map((r) => [r.id, r.side]))
  const bySide: Record<SideId, number> = Object.fromEntries(registry.sides.map((s) => [s.id, 0]))
  for (const card of deck) {
    const side = sideOf.get(card)
    if (side !== undefined) bySide[side] = (bySide[side] ?? 0) + 1
  }

  const killers = new Set(registry.nightActions.filter((a) => a.effect === 'kill').flatMap((a) => a.performers))
  if (!deck.some((card) => killers.has(card))) warnings.push('no_killer')
  if (blackNotLess(bySide)) warnings.push('black_not_less_than_red')

  return { errors, warnings, deck, civilians, bySide }
}

/**
 * Ночные действия состава по порядку: те, у кого в колоде есть хотя бы один исполнитель.
 * Наследник действия (к кому переходит выстрел) тоже исполнитель: шаг в ночи будет и без основных носителей.
 */
export function nightOrder(registry: Registry, deck: readonly RoleId[]): NightActionDef[] {
  const cards = new Set(deck)
  return [...registry.nightActions]
    .sort((a, b) => a.order - b.order)
    .filter((def) => (def.inheritedBy ? [...def.performers, def.inheritedBy] : def.performers).some((role) => cards.has(role)))
}

// ── Опции ролей ─────────────────────────────────────────────────────────────

/** Значение опции из набора значений: нет ключа или значение не того вида — умолчание из справочника. */
export function optionValue(def: RoleOptionDef, values: SessionConfig['roleOptions']): boolean | string {
  const given: unknown = typeof values === 'object' && values !== null ? values[def.id] : undefined
  if (def.kind === 'toggle') return typeof given === 'boolean' ? given : def.default
  return typeof given === 'string' && def.choices.some((c) => c.value === given) ? given : def.default
}

/** Значение опции роли в этой игре. Опции с таким id в справочнике нет — false. */
export function roleOption(session: Session, registry: Registry, id: string): boolean | string {
  for (const role of registry.roles) {
    const def = role.options?.find((o) => o.id === id)
    if (def) return optionValue(def, session.config.roleOptions)
  }
  return false
}

// ── Умолчания сессии ────────────────────────────────────────────────────────

export const DEFAULT_DURATIONS: Durations = { speech: 60, balagan: 60, defense: 30, tiebreak: 30, farewell: 30 }
/** Правила новой игры. */
export const DEFAULT_RULES: Rules = {
  nominationsFromDay: 2, balaganFromDay: 2, balagan: true, farewellAfterVote: true, farewellAfterNight: false, prostituteFirst: true,
}
/** Как играли до появления правил партии: балаган есть, прощание только после голосования, проститутка после мафии. */
export const LEGACY_RULES: Rules = { ...DEFAULT_RULES, prostituteFirst: false }

/** Есть ли в День n шаг «Балаган»: правило включено и день не раньше первого дня с балаганом. */
export function balaganInDay(rules: Rules, n: number): boolean {
  return rules.balagan && n >= rules.balaganFromDay
}

/**
 * Правила сохранённой игры: недостающее или испорченное поле читается «как было до обновления».
 * fallback — откуда брать недостающее: для черновика новой игры это умолчания новой игры.
 */
export function normalizeRules(input: unknown, fallback: Rules = LEGACY_RULES): Rules {
  const given: Record<string, unknown> = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const num = (key: 'nominationsFromDay' | 'balaganFromDay'): number => {
    const value = given[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback[key]
  }
  const flag = (key: 'balagan' | 'farewellAfterVote' | 'farewellAfterNight' | 'prostituteFirst'): boolean => {
    const value = given[key]
    return typeof value === 'boolean' ? value : fallback[key]
  }
  return {
    nominationsFromDay: num('nominationsFromDay'), balaganFromDay: num('balaganFromDay'),
    balagan: flag('balagan'), farewellAfterVote: flag('farewellAfterVote'), farewellAfterNight: flag('farewellAfterNight'),
    prostituteFirst: flag('prostituteFirst'),
  }
}

/** Пустая сессия: настройки есть, журнал пуст. Раздачу добавляет команда deal. */
export function newSession(id: string, now: number, config: SessionConfig): Session {
  return { schemaVersion: 1, id, createdAt: now, updatedAt: now, config, log: [], nextSeq: 1, undo: [], timer: null, paused: false }
}
