// Все типы движка. Движок не знает о React, DOM, часах и случайности.

export type Seat = number
export type RoleId = string
export type SideId = string
export type EffectId = 'kill' | 'heal' | 'block' | 'check_side' | 'find_role'

/** colorVar — переменная CSS для точки стороны; ring — светлое кольцо вокруг точки. */
export type SideDef = { id: SideId; nameKey: string; colorVar: string; ring?: true }

export type RoleDef = {
  id: RoleId
  nameKey: string
  side: SideId
  /** Добирает остаток игроков (мирный житель). */
  filler?: true
  defaultCount: number
  /** Входит в счётчик другой роли в составе. */
  countsWithin?: RoleId
  /** Сколько таких внутри родителя. */
  exactCount?: number
  /** Чьим названием показана на столе. */
  displayAs?: RoleId
  /** Ключ пометки на карточке. */
  markKey?: string
  seenBySheriffAs: SideId
}

export type NightActionDef = {
  id: string
  order: number
  effect: EffectId
  performers: RoleId[]
  scope: 'team' | 'each'
  /** Блок лидера отменяет командное действие. */
  leader?: RoleId
  /** Кто выполняет, когда живых performers нет. */
  inheritedBy?: RoleId
  /** Для find_role: какую роль ищут. */
  findRole?: RoleId
  noRepeatTarget?: true
  stepKey: string
  questionKey: string
}

export type Registry = { sides: SideDef[]; roles: RoleDef[]; nightActions: NightActionDef[] }
