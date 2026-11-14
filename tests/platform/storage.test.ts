import { metaOf } from '../../src/app/store'
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
