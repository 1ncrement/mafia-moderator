import { createAppStore } from '../../src/app/store'
import { DEFAULT_REGISTRY } from '../../src/engine'
import { seeded, testEnv } from '../helpers'

const input = { name: '  Адвокат ', side: 'red', night: true }

test('добавленная роль в перечне, в составе с количеством 1 и в справочнике экрана состава', () => {
  const env = testEnv(); const app = createAppStore(env); app.newGame()
  expect(app.addCustomRole(input)).toBeNull()
  const [role] = app.getState().settings.customRoles
  expect(role).toMatchObject({ name: 'Адвокат', side: 'red', night: true }); expect(role!.id).toMatch(/^custom_/)
  expect(app.getState().draft.composition[role!.id]).toBe(1)
  expect(app.registry.roles.at(-1)).toMatchObject({ id: role!.id, custom: true })
  // перечень пережил перезапуск, хотя игру не раздавали
  expect(createAppStore(testEnv(env.kv)).getState().settings.customRoles).toEqual([role])
})
test('название проверяется: пустое, длинное, занятое', () => {
  const app = createAppStore(testEnv()); app.newGame()
  expect(app.addCustomRole({ ...input, name: '   ' })).toBe('empty')
  expect(app.addCustomRole({ ...input, name: 'ШЕРИФ' })).toBe('duplicate')
  expect(app.addCustomRole({ ...input, name: 'лікар' })).toBe('duplicate')
  expect(app.addCustomRole({ ...input, name: 'я'.repeat(40) })).toBeNull()
  expect(app.getState().settings.customRoles[0]!.name).toBe('я'.repeat(24))
  expect(app.addCustomRole(input)).toBeNull(); expect(app.addCustomRole({ ...input, name: 'адвокат' })).toBe('duplicate')
})
test('не больше восьми своих ролей', () => {
  const app = createAppStore(testEnv()); app.newGame()
  for (let i = 0; i < 8; i++) expect(app.addCustomRole({ ...input, name: `роль ${i}` })).toBeNull()
  expect(app.addCustomRole({ ...input, name: 'девятая' })).toBe('limit')
  expect(app.getState().settings.customRoles).toHaveLength(8)
})
test('правка и удаление', () => {
  const app = createAppStore(testEnv()); app.newGame(); app.addCustomRole(input)
  const id = app.getState().settings.customRoles[0]!.id
  expect(app.updateCustomRole(id, { name: 'Репортёр', side: 'black', night: false })).toBeNull()
  expect(app.getState().settings.customRoles).toEqual([{ id, name: 'Репортёр', side: 'black', night: false }])
  expect(app.updateCustomRole(id, { name: 'мафия', side: 'black', night: false })).toBe('duplicate')
  app.removeCustomRole(id)
  expect(app.getState().settings.customRoles).toEqual([]); expect(app.getState().draft.composition).not.toHaveProperty([id])
})
test('игра хранит копию участвующих ролей и открывается после удаления роли из перечня', () => {
  const env = testEnv(); const app = createAppStore(env); app.newGame()
  app.addCustomRole(input); app.addCustomRole({ name: 'Оборотень', side: 'black', night: false })
  const [j, m] = app.getState().settings.customRoles
  app.editDraft({ playerCount: 11, composition: { ...app.getState().draft.composition, [m!.id]: 0 } })
  app.dealDraft()
  expect(app.getState().session!.config.customRoles).toEqual([j])
  expect(app.getState().game!.players.filter((p) => p.roleId === j!.id)).toHaveLength(1)
  app.goHome(); app.removeCustomRole(j!.id)
  const again = createAppStore(testEnv(env.kv)); again.openSession(app.getState().sessions[0]!.id)
  expect(again.getState().brokenSession).toBeNull()
  expect(again.registry.roles.find((r) => r.id === j!.id)).toMatchObject({ name: 'Адвокат' })
  again.rematch()
  expect(again.getState().settings.customRoles.map((r) => r.id)).toContain(j!.id)
})
test('сессия без customRoles и мусор в настройках не мешают запуску', () => {
  const env = testEnv(); const app = seeded(env); const id = app.getState().session!.id
  // Игра, сохранённая до обновления: поля customRoles в её настройках нет вовсе.
  const raw = JSON.parse(env.kv.getItem(`mafia:session:${id}`)!) as { config: Record<string, unknown> }
  delete raw.config.customRoles
  env.kv.setItem(`mafia:session:${id}`, JSON.stringify(raw))
  const old = createAppStore(testEnv(env.kv))
  expect(old.getState().session!.config).not.toHaveProperty('customRoles')
  // Справочник — встроенные роли без добавок (порядок ночи в нём — по правилам партии этой игры).
  expect(old.getState()).toMatchObject({ screen: 'deal', brokenSession: null }); expect(old.registry.roles).toBe(DEFAULT_REGISTRY.roles)
  expect(old.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } }).ok).toBe(true)
  env.kv.setItem('mafia:settings', JSON.stringify({ lang: 'ru', customRoles: 'мусор' }))
  expect(createAppStore(testEnv(env.kv)).getState().settings.customRoles).toEqual([])
  env.kv.setItem('mafia:settings', JSON.stringify({ lang: 'ru', customRoles: [{ id: 5 }, { id: 'c1', name: 'ок', side: 'red', night: false }] }))
  const next = createAppStore(testEnv(env.kv))
  expect(next.getState().settings.customRoles.map((r) => r.name)).toEqual(['ок'])
  expect(next.getState().game).not.toBeNull()
})
test('название встроенной роли занято во всех формах, которыми она подписана на экране', () => {
  const app = createAppStore(testEnv()); app.newGame()
  expect(app.addCustomRole({ ...input, name: 'Мирные жители' })).toBe('duplicate')
  expect(app.addCustomRole({ ...input, name: 'мирні' })).toBe('duplicate')
  expect(app.addCustomRole({ ...input, name: 'Крёстный отец' })).toBe('duplicate')
})
/** Приложение с завершённой раздачей, в которой участвует «Адвокат», уже удалённый из перечня. */
function playedAndRemoved() {
  const env = testEnv(); const app = createAppStore(env); app.newGame(); app.addCustomRole(input)
  const old = app.getState().settings.customRoles[0]!
  app.editDraft({ playerCount: 11 }); app.dealDraft()
  const sessionId = app.getState().session!.id
  app.goHome(); app.removeCustomRole(old.id)
  return { app, old, sessionId }
}
test('«с тем же составом»: в перечне уже есть роль с таким названием — двойник не создаётся, количество переходит к ней', () => {
  const { app, old, sessionId } = playedAndRemoved()
  app.newGame(); app.addCustomRole({ name: 'адвокат', side: 'black', night: false })
  const fresh = app.getState().settings.customRoles[0]!
  app.openSession(sessionId); app.rematch()
  expect(app.getState().settings.customRoles).toEqual([fresh])
  expect(app.getState().draft.composition[fresh.id]).toBe(1)
  expect(app.getState().draft.composition).not.toHaveProperty([old.id])
})
test('«с тем же составом» не выводит перечень за предел восьми ролей', () => {
  const { app, old, sessionId } = playedAndRemoved()
  app.newGame(); for (let i = 0; i < 8; i++) app.addCustomRole({ ...input, name: `роль ${i}` })
  app.openSession(sessionId); app.rematch()
  expect(app.getState().settings.customRoles).toHaveLength(8)
  expect(app.getState().settings.customRoles.map((r) => r.id)).not.toContain(old.id)
})
test('«Назад к составу» тоже возвращает роль раздачи в перечень', () => {
  const env = testEnv(); const app = createAppStore(env); app.newGame(); app.addCustomRole(input)
  const role = app.getState().settings.customRoles[0]!
  app.editDraft({ playerCount: 11 }); app.dealDraft()
  // Перечень изменили в другой вкладке, пока раздача открыта.
  env.kv.setItem('mafia:settings', JSON.stringify({ lang: 'ru', customRoles: [] }))
  const other = createAppStore(testEnv(env.kv))
  expect(other.getState().settings.customRoles).toEqual([])
  other.backToSetup()
  expect(other.getState().settings.customRoles).toEqual([role]); expect(other.getState().draft.composition[role.id]).toBe(1)
})
test('негодные по смыслу записи перечня отбрасываются при запуске', () => {
  const env = testEnv()
  env.kv.setItem('mafia:settings', JSON.stringify({ lang: 'ru', customRoles: [
    { id: 'c1', name: 'чужая сторона', side: 'green', night: false }, { id: 'c2', name: 'да', side: 'red', night: true },
    { id: 'c2', name: 'повтор', side: 'red', night: true }, { id: 'a:b', name: 'двоеточие', side: 'red', night: true },
  ] }))
  const app = createAppStore(env)
  expect(app.getState().settings.customRoles).toEqual([{ id: 'c2', name: 'да', side: 'red', night: true }])
  app.newGame(); expect(app.registry.roles.filter((r) => r.custom).map((r) => r.id)).toEqual(['c2'])
})
test('игра с испорченным customRoles не роняет запуск и не затирается', () => {
  const env = testEnv(); const app = seeded(env); const id = app.getState().session!.id
  const raw = JSON.parse(env.kv.getItem(`mafia:session:${id}`)!) as { config: Record<string, unknown> }
  raw.config.customRoles = 'мусор'
  env.kv.setItem(`mafia:session:${id}`, JSON.stringify(raw))
  const next = createAppStore(testEnv(env.kv))
  expect(next.getState()).toMatchObject({ screen: 'home', game: null, brokenSession: id })
  expect(env.kv.getItem(`mafia:session:${id}`)).toContain('мусор')
  // Негодные записи внутри массива игру не ломают: роль просто не попадает в справочник.
  raw.config.customRoles = [{ id: 5 }, null]
  env.kv.setItem(`mafia:session:${id}`, JSON.stringify(raw))
  expect(createAppStore(testEnv(env.kv)).getState()).toMatchObject({ screen: 'deal', brokenSession: null })
})
test('черновик состава после «с тем же составом» не несёт копию ролей прошлой игры', () => {
  const { app, sessionId } = playedAndRemoved()
  app.openSession(sessionId); app.rematch()
  expect(app.getState().draft).not.toHaveProperty('customRoles')
})
// Дополнение, раздел 8, шаги 3–4: «уйти на главную и вернуться — обе роли на месте», затем «раздать — обе роли названы».
test('роль, добавленная без раздачи, после ухода на главную остаётся в составе с количеством 1', () => {
  const env = testEnv(); const app = createAppStore(env); app.newGame(); app.addCustomRole(input)
  const id = app.getState().settings.customRoles[0]!.id
  app.goHome(); app.newGame()
  expect(app.getState().draft.composition[id]).toBe(1)
  // и после перезапуска приложения
  const again = createAppStore(testEnv(env.kv)); again.newGame()
  expect(again.getState().draft.composition[id]).toBe(1)
  again.editDraft({ playerCount: 11 }); again.dealDraft()
  expect(again.getState().game!.players.filter((p) => p.roleId === id)).toHaveLength(1)
})
test('роль, выключенная в розданном составе, в следующей новой игре остаётся выключенной', () => {
  const app = createAppStore(testEnv()); app.newGame(); app.addCustomRole(input)
  const id = app.getState().settings.customRoles[0]!.id
  app.editDraft({ composition: { ...app.getState().draft.composition, [id]: 0 } }); app.dealDraft()
  app.goHome(); app.newGame()
  expect(app.getState().draft.composition[id]).toBe(0)
})

// ── По итогам независимого ревью ────────────────────────────────────────────

test('состав, розданный без роли, остаётся стартовым: следующая «Новая игра» роль сама не включает', () => {
  const app = createAppStore(testEnv())
  app.newGame(); app.editDraft({ playerCount: 11 }); app.dealDraft()      // игра А без своих ролей
  const oldId = app.getState().session!.id; app.goHome()
  app.newGame(); app.addCustomRole({ name: 'Оборотень', side: 'black', night: false })
  const maniac = app.getState().settings.customRoles[0]!.id
  app.dealDraft(); app.goHome()                                            // игра Б с оборотеньом
  app.openSession(oldId); app.rematch(); app.dealDraft(); app.goHome()     // «с тем же составом» игры А
  app.newGame()
  expect(app.getState().draft.composition[maniac]).toBe(0)
})
test('роль переименовали после раздачи: игра показывает роль, какой она была при раздаче', () => {
  const app = createAppStore(testEnv()); app.newGame(); app.addCustomRole(input)
  const id = app.getState().settings.customRoles[0]!.id
  app.editDraft({ playerCount: 11 }); app.dealDraft()
  const sessionId = app.getState().session!.id; app.goHome()
  expect(app.updateCustomRole(id, { name: 'Репортёр', side: 'black', night: false })).toBeNull()
  app.openSession(sessionId)
  expect(app.registry.roles.find((r) => r.id === id)).toMatchObject({ name: 'Адвокат', side: 'red' })
  expect(app.registry.nightActions.some((a) => a.performers.includes(id))).toBe(true)
  app.goHome(); app.newGame()
  expect(app.registry.roles.find((r) => r.id === id)).toMatchObject({ name: 'Репортёр', side: 'black' })
  expect(app.registry.nightActions.some((a) => a.performers.includes(id))).toBe(false)
})
