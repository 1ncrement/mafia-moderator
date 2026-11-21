import { metaOf } from '../../src/app/store'
import { DEFAULT_RULES } from '../../src/engine'
import { createStorage, DEFAULT_SETTINGS } from '../../src/platform/storage'
import { fakeKV, game, TABLE_11 } from '../helpers'

test('сессия, индекс, активная игра и настройки сохраняются и читаются', () => {
  const kv = fakeKV(); const st1 = createStorage(kv); const s = game(TABLE_11)
  expect(st1.save(s, metaOf(s))).toBe(true); st1.setActiveId(s.id)
  const st2 = createStorage(kv)
  expect(st2.load(s.id)).toEqual({ ok: true, session: s }); expect(st2.list()).toHaveLength(1); expect(st2.activeId()).toBe(s.id)
  expect(st2.settings()).toEqual(DEFAULT_SETTINGS)
})
test('битые данные не затираются', () => {
  const kv = fakeKV(); kv.setItem('mafia:session:a', '{не json'); kv.setItem('mafia:session:b', JSON.stringify({ schemaVersion: 99 }))
  expect(createStorage(kv).load('a')).toEqual({ ok: false, raw: '{не json' })
  expect(createStorage(kv).load('b')).toMatchObject({ ok: false }); expect(kv.getItem('mafia:session:a')).toBe('{не json')
})
test('запись не удалась — false, без исключения', () => {
  const kv = fakeKV(); kv.failWrites = true; expect(createStorage(kv).save(game(TABLE_11), metaOf(game(TABLE_11)))).toBe(false)
})
test('удаление убирает сессию из индекса и снимает активную', () => {
  const kv = fakeKV(); const storage = createStorage(kv); const s = game(TABLE_11)
  storage.save(s, metaOf(s)); storage.setActiveId(s.id); storage.remove(s.id)
  expect(storage.list()).toEqual([]); expect(storage.load(s.id)).toBeNull(); expect(storage.activeId()).toBeNull()
})

// ── Правила партии в сохранённых данных ─────────────────────────────────────

const OLD_RULES = { nominationsFromDay: 2, balaganFromDay: 2 }
const LEGACY = { ...OLD_RULES, balagan: true, farewellAfterVote: true, farewellAfterNight: false, prostituteFirst: false }
const withRules = (rules: unknown) => {
  const s = game(TABLE_11)
  return { ...s, config: { ...s.config, rules } }
}

test('игра, сохранённая до обновления (правила из двух полей), открывается по прежним правилам', () => {
  const kv = fakeKV(); const old = withRules(OLD_RULES)
  kv.setItem(`mafia:session:${old.id}`, JSON.stringify(old))
  const loaded = createStorage(kv).load(old.id)
  expect(loaded).toMatchObject({ ok: true })
  expect(loaded?.ok && loaded.session.config.rules).toEqual(LEGACY)
  // Остальное в сессии не тронуто.
  expect(loaded?.ok && loaded.session.log).toEqual(old.log)
})
test('правила — не объект: сессия нечитаема, данные не затираются', () => {
  const kv = fakeKV()
  for (const [id, rules] of [['a', null], ['b', 'строка'], ['c', [1, 2]], ['d', { nominationsFromDay: 2 }]] as const) {
    const raw = JSON.stringify({ ...withRules(rules), id })
    kv.setItem(`mafia:session:${id}`, raw)
    expect(createStorage(kv).load(id)).toEqual({ ok: false, raw })
  }
})
test('последний состав из старых настроек получает правила новой игры, а не теряет поля', () => {
  const kv = fakeKV(); const old = withRules(OLD_RULES)
  kv.setItem('mafia:settings', JSON.stringify({ ...DEFAULT_SETTINGS, lastConfig: old.config }))
  expect(createStorage(kv).settings().lastConfig?.rules).toEqual(DEFAULT_RULES)
  // Что ведущий уже выбирал сам, остаётся.
  kv.setItem('mafia:settings', JSON.stringify({ ...DEFAULT_SETTINGS, lastConfig: { ...old.config, rules: { ...OLD_RULES, balagan: false } } }))
  expect(createStorage(kv).settings().lastConfig?.rules).toEqual({ ...DEFAULT_RULES, balagan: false })
})
