import type { Registry } from '../types'

/**
 * Справочник ролей. Новая роль с существующим эффектом — одна запись здесь
 * и строки в обоих словарях. Вне этой папки идентификаторы ролей и сторон не упоминаются.
 */
export const DEFAULT_REGISTRY: Registry = {
  sides: [
    { id: 'red', nameKey: 'side.red', colorVar: '--red' },
    { id: 'black', nameKey: 'side.black', colorVar: '--black', ring: true },
  ],
  roles: [
    { id: 'civilian', nameKey: 'role.civilian', side: 'red', filler: true, defaultCount: 0, seenBySheriffAs: 'red' },
    { id: 'mafia', nameKey: 'role.mafia', side: 'black', defaultCount: 1, seenBySheriffAs: 'black' },
    {
      id: 'godfather', nameKey: 'role.godfather', side: 'black', defaultCount: 0,
      countsWithin: 'mafia', exactCount: 1, displayAs: 'mafia', markKey: 'mark.head', seenBySheriffAs: 'black',
    },
    { id: 'prostitute', nameKey: 'role.prostitute', side: 'black', defaultCount: 1, seenBySheriffAs: 'black' },
    { id: 'sheriff', nameKey: 'role.sheriff', side: 'red', defaultCount: 1, seenBySheriffAs: 'red' },
    { id: 'doctor', nameKey: 'role.doctor', side: 'red', defaultCount: 1, seenBySheriffAs: 'red' },
  ],
  nightActions: [
    {
      id: 'mafia_shot', order: 10, effect: 'kill', performers: ['mafia', 'godfather'], scope: 'team',
      leader: 'godfather', inheritedBy: 'prostitute',
      stepKey: 'action.mafia_shot.step', questionKey: 'action.mafia_shot.question',
    },
    {
      id: 'godfather_search', order: 15, effect: 'find_role', performers: ['godfather'], scope: 'each',
      findRole: 'sheriff',
      stepKey: 'action.godfather_search.step', questionKey: 'action.godfather_search.question',
    },
    {
      id: 'prostitute_block', order: 20, effect: 'block', performers: ['prostitute'], scope: 'each',
      stepKey: 'action.prostitute_block.step', questionKey: 'action.prostitute_block.question',
    },
    {
      id: 'sheriff_check', order: 30, effect: 'check_side', performers: ['sheriff'], scope: 'each',
      stepKey: 'action.sheriff_check.step', questionKey: 'action.sheriff_check.question',
    },
    {
      id: 'doctor_heal', order: 40, effect: 'heal', performers: ['doctor'], scope: 'each',
      noRepeatTarget: true,
      stepKey: 'action.doctor_heal.step', questionKey: 'action.doctor_heal.question',
    },
  ],
}
