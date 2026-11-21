import { entryText, journalAsText, phaseLabel, summaryText } from '../../src/app/i18n'
import { ru } from '../../src/app/i18n/ru'
import { uk } from '../../src/app/i18n/uk'
import { DEFAULT_REGISTRY, journal } from '../../src/engine'
import type { JournalEntry } from '../../src/engine'
import { act, n1, play } from '../helpers'

test('у словарей одинаковые ключи и нет пустых строк', () => {
  expect(Object.keys(uk).sort()).toEqual(Object.keys(ru).sort())
  for (const d of [ru, uk]) for (const v of Object.values(d)) expect(v.trim()).not.toBe('')
})
test('названия фаз и подстановка', () => {
  expect(phaseLabel('ru', { kind: 'night', n: 2 })).toBe('Ночь 2'); expect(phaseLabel('uk', { kind: 'night', n: 2 })).toBe('Ніч 2')
  expect(phaseLabel('ru', { kind: 'deal' })).toBe('Распределение')
})
test('у каждой роли, стороны и ночного действия справочника есть тексты', () => {
  for (const r of DEFAULT_REGISTRY.roles) expect(ru).toHaveProperty([r.nameKey])
  for (const s of DEFAULT_REGISTRY.sides) expect(ru).toHaveProperty([s.nameKey])
  for (const a of DEFAULT_REGISTRY.nightActions) { expect(ru).toHaveProperty([a.stepKey]); expect(ru).toHaveProperty([a.questionKey]) }
  // Опции ролей: подпись опции, подписи вариантов и предупреждения.
  for (const o of DEFAULT_REGISTRY.roles.flatMap((r) => r.options ?? [])) {
    expect(ru).toHaveProperty([o.labelKey])
    if (o.kind === 'choice') for (const c of o.choices) { expect(ru).toHaveProperty([c.labelKey]); if (c.lateBlockKey) expect(ru).toHaveProperty([c.lateBlockKey]) }
  }
})
test('запись журнала переводится на оба языка', () => {
  const e: JournalEntry = { kind: 'night_action', actionId: 'godfather_search', performerRole: 'godfather', actor: 3, target: 1,
    answer: { kind: 'found', found: true }, eventId: 'e', edited: false, manual: false }
  expect(entryText('ru', e, DEFAULT_REGISTRY)).toBe('Крёстный отец → №1 — шериф')
  expect(entryText('uk', e, DEFAULT_REGISTRY)).not.toBe(entryText('ru', e, DEFAULT_REGISTRY))
})
test('резюме ночи и журнал текстом', () => {
  const s = play(n1(), act('mafia_shot', null, 7), act('doctor_heal', 4, 7), { type: 'confirmNight', chosen: null })
  const groups = journal(s, DEFAULT_REGISTRY)
  expect(summaryText('ru', groups[1]!, DEFAULT_REGISTRY)).toBe('Ночь 1: выстрел в №7, лечили №7 → никто не выбыл')
  const text = journalAsText('ru', groups, DEFAULT_REGISTRY)
  expect(text.indexOf('Распределение')).toBeLessThan(text.indexOf('Ночь 1')); expect(text).toContain('Мафия → №7')
})
