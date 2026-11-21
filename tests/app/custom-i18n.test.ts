import { compositionText, entryText, roleLabel, roleName, roleTitle, stepName, stepQuestion, summaryBody } from '../../src/app/i18n'
import { DEFAULT_REGISTRY, journal, registryFor } from '../../src/engine'
import { act, customNight, JOURNALIST, MANIAC, playWith } from '../helpers'

const R = registryFor(DEFAULT_REGISTRY, [JOURNALIST, MANIAC])
const role = (id: string) => R.roles.find((r) => r.id === id)!
const action = (id: string) => R.nightActions.find((a) => a.id === id)!

test('название своей роли одинаково на обоих языках, встроенной — переводится', () => {
  expect(roleTitle('ru', role('custom_j'))).toBe('журналист'); expect(roleTitle('uk', role('custom_j'))).toBe('журналист')
  expect(roleTitle('uk', role('doctor'))).toBe('лікар')
  expect(roleName('uk', R, 'custom_m')).toBe('маньяк'); expect(roleLabel('ru', R, 'custom_j').name).toBe('журналист')
})
test('шаг и вопрос своей роли строятся из её названия', () => {
  expect(stepName('ru', R, action('act_custom_j'))).toBe('Журналист')
  expect(stepName('ru', R, action('mafia_shot'))).toBe('Мафия')
  expect(stepQuestion('ru', R, action('act_custom_j'), 'custom_j', false)).toBe('Кого выбирает журналист?')
  expect(stepQuestion('uk', R, action('act_custom_j'), 'custom_j', false)).toBe('Кого обирає журналист?')
  expect(stepQuestion('ru', R, action('doctor_heal'), 'doctor', false)).toBe('Кого лечит доктор?')
  expect(stepQuestion('ru', R, action('mafia_shot'), 'prostitute', true)).toBe('В кого стреляет проститутка?')
})
test('состав и журнал называют свою роль', () => {
  expect(compositionText('ru', R, { godfather: 1, mafia: 1, custom_j: 1, custom_m: 1, civilian: 4 })).toBe('мафия 2 (из них крёстный отец 1), журналист 1, маньяк 1, мирных 4')
  const { s } = customNight()
  const done = playWith(R, s, act('mafia_shot', null, 7), act('act_custom_j', 6, 9), { type: 'confirmNight', died: [7] })
  const group = journal(done, R).find((g) => g.phase.kind === 'night')!
  expect(group.entries.map((e) => entryText('ru', e, R))).toContain('Журналист → №9')
  expect(summaryBody('ru', group, R)).toContain('журналист: №9')
  // Стрелка в резюме ночи одна — перед итогом.
  expect(summaryBody('ru', group, R).split('→')).toHaveLength(2)
})

test('название своей роли показано по образцу встроенных: со строчной буквы, аббревиатура — как есть', () => {
  const reg = registryFor(DEFAULT_REGISTRY, [
    { id: 'c1', name: 'Журналист', side: 'red', night: true },
    { id: 'c2', name: 'КГБ', side: 'black', night: true },
    { id: 'c3', name: 'Дон Корлеоне', side: 'black', night: false },
  ])
  const act = (id: string) => reg.nightActions.find((a) => a.id === id)!
  // Внутри фразы и на карточке — как у встроенных ролей.
  expect(roleName('ru', reg, 'c1')).toBe('журналист'); expect(roleLabel('ru', reg, 'c1').name).toBe('журналист')
  expect(roleName('ru', reg, 'c2')).toBe('КГБ'); expect(roleName('ru', reg, 'c3')).toBe('дон Корлеоне')
  expect(stepQuestion('ru', reg, act('act_c1'), 'c1', false)).toBe('Кого выбирает журналист?')
  expect(compositionText('ru', reg, { c1: 1, c2: 1 })).toBe('журналист 1, КГБ 1')
  // В начале строки — с заглавной.
  expect(stepName('ru', reg, act('act_c1'))).toBe('Журналист'); expect(stepName('ru', reg, act('act_c2'))).toBe('КГБ')
})
