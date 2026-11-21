import type { Registry } from '../types'

/**
 * Справочник ролей. Новая роль с существующим эффектом — одна запись здесь
 * и строки в обоих словарях. Вне этой папки идентификаторы ролей и сторон не упоминаются.
 */
export const DEFAULT_REGISTRY: Registry = {
  sides: [
    { id: 'black', nameKey: 'side.black', colorVar: '--black', ring: true },
    { id: 'red', nameKey: 'side.red', colorVar: '--red' },
    // Одиночки: у каждого своя сторона — он побеждает один и ни с кем не «на одной стороне».
    { id: 'solo_butcher', nameKey: 'side.solo_butcher', colorVar: '--solo', solo: true },
    { id: 'solo_maniac', nameKey: 'side.solo_maniac', colorVar: '--solo', solo: true },
  ],
  roles: [
    { id: 'civilian', nameKey: 'role.civilian', side: 'red', filler: true, defaultCount: 0, seenBySheriffAs: 'red' },
    { id: 'mafia', nameKey: 'role.mafia', side: 'black', defaultCount: 1, seenBySheriffAs: 'black' },
    {
      id: 'godfather', nameKey: 'role.godfather', side: 'black', defaultCount: 0,
      countsWithin: 'mafia', exactCount: 1, displayAs: 'mafia', markKey: 'mark.head', seenBySheriffAs: 'black',
    },
    {
      id: 'prostitute', nameKey: 'role.prostitute', side: 'black', defaultCount: 1, seenBySheriffAs: 'black',
      // Что отменяет блок главы мафии. Отмена поиска имеет смысл, только если блок известен до хода главы.
      options: [{
        id: 'leader_block', kind: 'choice', default: 'shot', labelKey: 'option.leader_block',
        choices: [
          { value: 'shot', labelKey: 'option.leader_block.shot' },
          { value: 'search', labelKey: 'option.leader_block.search', lateBlockKey: 'option.leader_block.late' },
          { value: 'both', labelKey: 'option.leader_block.both', lateBlockKey: 'option.leader_block.late' },
        ],
      }],
    },
    { id: 'sheriff', nameKey: 'role.sheriff', side: 'red', defaultCount: 1, seenBySheriffAs: 'red' },
    { id: 'doctor', nameKey: 'role.doctor', side: 'red', defaultCount: 1, seenBySheriffAs: 'red' },
    // Новые роли по умолчанию выключены. Шериф видит одиночек красными.
    { id: 'bodyguard', nameKey: 'role.bodyguard', side: 'red', defaultCount: 0, seenBySheriffAs: 'red', tagKey: 'role.tag.new' },
    {
      id: 'journalist', nameKey: 'role.journalist', side: 'red', defaultCount: 0, seenBySheriffAs: 'red', tagKey: 'role.tag.new',
      options: [{
        id: 'journalist_pace', kind: 'choice', default: 'every', labelKey: 'option.journalist_pace', hintKey: 'option.journalist_pace.hint',
        choices: [
          { value: 'every', labelKey: 'option.journalist_pace.every' },
          { value: 'alternate', labelKey: 'option.journalist_pace.alternate' },
        ],
      }],
    },
    { id: 'butcher', nameKey: 'role.butcher', side: 'solo_butcher', defaultCount: 0, maxCount: 1, seenBySheriffAs: 'red', tagKey: 'role.tag.new' },
    {
      id: 'maniac', nameKey: 'role.maniac', side: 'solo_maniac', defaultCount: 0, maxCount: 1, seenBySheriffAs: 'red', tagKey: 'role.tag.new',
      options: [
        { id: 'maniac_no_repeat', kind: 'toggle', default: true, labelKey: 'option.maniac_no_repeat' },
        { id: 'maniac_no_nominate', kind: 'toggle', default: false, labelKey: 'option.maniac_no_nominate' },
        { id: 'maniac_no_vote', kind: 'toggle', default: false, labelKey: 'option.maniac_no_vote' },
      ],
    },
    { id: 'bulletproof', nameKey: 'role.bulletproof', side: 'red', defaultCount: 0, extraLife: true, seenBySheriffAs: 'red', tagKey: 'role.tag.new' },
  ],
  nightActions: [
    {
      id: 'mafia_shot', order: 10, effect: 'kill', performers: ['mafia', 'godfather'], scope: 'team',
      leader: 'godfather', inheritedBy: 'prostitute', blockCancels: { option: 'leader_block', values: ['shot', 'both'] },
      stepKey: 'action.mafia_shot.step', questionKey: 'action.mafia_shot.question',
    },
    {
      id: 'godfather_search', order: 15, effect: 'find_role', performers: ['godfather'], scope: 'each',
      findRole: 'sheriff', blockCancels: { option: 'leader_block', values: ['search', 'both'] },
      stepKey: 'action.godfather_search.step', questionKey: 'action.godfather_search.question',
    },
    {
      id: 'prostitute_block', order: 20, effect: 'block', performers: ['prostitute'], scope: 'each',
      stepKey: 'action.prostitute_block.step', questionKey: 'action.prostitute_block.question',
    },
    // Одиночки ходят после чёрных и перед красными: мясник, затем маньяк.
    {
      id: 'butcher_kill', order: 22, effect: 'kill', cause: 'slain', performers: ['butcher'], scope: 'each',
      stepKey: 'action.butcher_kill.step', questionKey: 'action.butcher_kill.question',
    },
    {
      id: 'maniac_visit', order: 25, effect: 'haunt', cause: 'haunted', performers: ['maniac'], scope: 'each',
      repeatOption: 'maniac_no_repeat', victim: { noNominate: 'maniac_no_nominate', noVote: 'maniac_no_vote' },
      stepKey: 'action.maniac_visit.step', questionKey: 'action.maniac_visit.question',
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
    // Охранник просыпается последним — после своих ролей ведущего (см. AFTER_CUSTOM_ORDER в custom.ts).
    {
      id: 'bodyguard_guard', order: 900, effect: 'guard', cause: 'guard', performers: ['bodyguard'], scope: 'each',
      noSelf: true, noRepeatTarget: true,
      stepKey: 'action.bodyguard_guard.step', questionKey: 'action.bodyguard_guard.question',
    },
  ],
}
