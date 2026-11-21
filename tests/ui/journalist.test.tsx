import { screen, within } from '@testing-library/react'
import type { AppStore } from '../../src/app/store'
import type { SessionConfig } from '../../src/engine'
import { renderApp } from './helpers'
import { card, nightOf, record, summaryOf } from './roleNights'

// Журналист на экране (макет JournalistStep). Стол: №1 шериф, №2 журналист, №3 крёстный отец, №4 доктор, №5 бронежилет,
// №6 мясник, №7 маньяк, №8 мафия, №9 мирный, №10 проститутка, №11 мирный.
const TABLE = 'S journalist G D bulletproof butcher maniac M c P c'
const STEP = 'journalist_compare:2'
const ALTERNATE = { roleOptions: { journalist_pace: 'alternate' } }
const step = (a: AppStore) => a.getState().game!.night!.steps.find((s) => s.id === STEP)!
const pick = (n: number) => screen.getByRole('button', { name: `Выбрать игрока №${n}` })
const navStep = () => document.querySelector(`[data-step="${STEP}"]`) as HTMLElement
/** Ночь 2 после Ночи 1 с записями, открыт шаг журналиста. */
const night2 = (records: Parameters<typeof nightOf>[1], config?: Partial<SessionConfig>, before?: (a: AppStore) => void) => (a: AppStore) => {
  nightOf(TABLE, records, undefined, config)(a); before?.(a)
  a.dispatch({ type: 'confirmNight', died: [] }); a.dispatch({ type: 'announceMorning' })
  a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 2 } }); a.dispatch({ type: 'enterStep', step: STEP })
}

test('выбор двух карточек на столе: первая выделена, повторный клик её снимает, вторая записывает пару и показывает ответ', async () => {
  const { app, user } = renderApp(nightOf(TABLE, [], STEP))
  expect(screen.getByText('Кого сравнивает журналист? Выбери двоих')).toBeInTheDocument(); expect(screen.getByText('Просыпается журналист — №2')).toBeInTheDocument()
  await user.click(pick(1))
  expect(pick(1)).toHaveClass('card-picked'); expect(step(app).recorded).toBe(false)
  expect(screen.getByText(/Выбран №1\. Выбери второго игрока/)).toBeInTheDocument()
  // Повторный клик по первой карточке снимает выбор.
  await user.click(pick(1))
  expect(pick(1)).not.toHaveClass('card-picked'); expect(screen.queryByText(/Выбран №1/)).not.toBeInTheDocument(); expect(step(app).recorded).toBe(false)
  await user.click(pick(1)); await user.click(pick(3))
  expect(step(app)).toMatchObject({ recorded: true, target: 1, target2: 3, answer: { kind: 'same', same: false } })
  expect(pick(1)).toHaveClass('card-picked'); expect(pick(3)).toHaveClass('card-picked')
  const answer = document.querySelector('.answer') as HTMLElement
  expect(answer).toHaveTextContent('Ответ · Журналист · №1 и №3'); expect(answer).toHaveTextContent('Разные стороны'); expect(answer).toHaveTextContent('Покажи игроку: разные')
  expect(within(navStep()).getByText('→ №1 и №3')).toBeInTheDocument()
  expect(within(card(1)).getByText('сравнивает журналист')).toBeInTheDocument(); expect(within(card(3)).getByText('сравнивает журналист')).toBeInTheDocument()
  // Новая пара заменяет прежнюю: запись меняется, когда выбран второй игрок.
  await user.click(pick(9)); expect(step(app)).toMatchObject({ target: 1, target2: 3 })
  await user.click(pick(11))
  expect(step(app)).toMatchObject({ target: 9, target2: 11, answer: { kind: 'same', same: true } })
  expect(document.querySelector('.answer')).toHaveTextContent('Одна сторона'); expect(document.querySelector('.answer')).toHaveTextContent('Покажи игроку: одна')
  expect(app.getState().session!.log.filter((e) => e.type === 'night_action')).toHaveLength(1)
})
test('«Никого» записывает ночь без проверки и сбрасывает начатый выбор', async () => {
  const { app, user } = renderApp(nightOf(TABLE, [], STEP))
  await user.click(pick(1)); await user.click(screen.getByRole('button', { name: 'Никого' }))
  expect(step(app)).toMatchObject({ recorded: true, target: null, target2: null })
  expect(pick(1)).not.toHaveClass('card-picked'); expect(document.querySelector('.answer')).toBeNull()
})
test('выбрать нельзя: уже проверенных, игрока с открытой ролью и самого журналиста — карточки заперты, строка объясняет', async () => {
  renderApp(night2([['journalist_compare', 2, 9, 11]], undefined, (a) => a.dispatch({ type: 'setVest', seat: 5, used: true })))
  expect(screen.getByText('Выбрать нельзя: №9 и №11 — уже проверены; №5 — роль открыта, жилет снят; №2 — сам журналист')).toBeInTheDocument()
  for (const n of [2, 5, 9, 11]) expect(screen.queryByRole('button', { name: `Выбрать игрока №${n}` })).not.toBeInTheDocument()
  expect(pick(1)).toBeInTheDocument()
  expect(screen.getByText(/Прошлой ночью: №9 и №11 — одна сторона/)).toBeInTheDocument()
})
test('«через ночь»: после проверки шаг говорит про ночь отдыха; в ночь отдыха выбрать никого нельзя', async () => {
  const first = renderApp(nightOf(TABLE, [['journalist_compare', 2, 9, 11]], STEP, ALTERNATE))
  expect(screen.getByText('Следующая проверка — через ночь. В Ночь 2 журналист проснётся, но проверять не будет.')).toBeInTheDocument()
  first.unmount()
  const { app } = renderApp(night2([['journalist_compare', 2, 9, 11]], ALTERNATE))
  expect(step(app).resting).toBe(true)
  expect(screen.getByText('Ночь отдыха')).toBeInTheDocument(); expect(screen.getByText(/Журналист проверял прошлой ночью: сегодня он просыпается, но не проверяет/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Выбрать игрока/ })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Никого' })).not.toBeInTheDocument()
  expect(within(navStep()).getByText('отдыхает')).toBeInTheDocument()
  // На итоге ночи отдыхающий журналист в «Не записано» не попадает.
  app.dispatch({ type: 'enterStep', step: 'summary' })
  expect(await screen.findByText(/Не записано:/)).not.toHaveTextContent('Журналист')
})
test('при «каждую ночь» строки про отдых нет', () => {
  renderApp(nightOf(TABLE, [['journalist_compare', 2, 9, 11]], STEP))
  expect(screen.queryByText(/Следующая проверка — через ночь/)).not.toBeInTheDocument()
})
test('журналист заблокирован: красный блок «Проверка этой ночью не состоится», ответа нет', async () => {
  const { user } = renderApp(nightOf(TABLE, [['prostitute_block', 10, 2]], STEP))
  expect(screen.getByRole('alert')).toHaveTextContent('№2 заблокирован'); expect(screen.getByRole('alert')).toHaveTextContent('Проверка этой ночью не состоится.')
  await user.click(pick(1)); await user.click(pick(3))
  expect(document.querySelector('.answer')).toBeNull(); expect(navStep()).toHaveAttribute('data-blocked')
})
test('доступных игроков меньше двух — «проверять некого»', () => {
  // №1 журналист, №2 крёстный отец, №3 и №4 мирные; мирные проверены в Ночь 1.
  renderApp((a) => {
    nightOf('journalist G c c', [['journalist_compare', 1, 3, 4]])(a); a.dispatch({ type: 'confirmNight', died: [] }); a.dispatch({ type: 'announceMorning' })
    a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 2 } }); a.dispatch({ type: 'enterStep', step: 'journalist_compare:1' })
  })
  expect(screen.getByText('Проверять некого: доступных игроков меньше двух.')).toBeInTheDocument()
})
test('при скрытых ролях на шаге журналиста не видно ни выбранных, ни списка «выбрать нельзя», ни ответа', () => {
  renderApp((a) => { nightOf(TABLE, [['journalist_compare', 2, 1, 3]], STEP)(a); a.setSettings({ rolesHidden: true }) })
  expect(screen.queryByText(/Выбрать нельзя|Разные стороны|№1 и №3/)).not.toBeInTheDocument()
  // Метки «сравнивает журналист» на карточках нет (сам вопрос шага роль называет, как и у остальных шагов).
  expect([...document.querySelectorAll('.card-mark')].map((el) => el.textContent)).toEqual([])
  expect(pick(1)).not.toHaveClass('card-picked')
})
test('журнал и правка записи: «Журналист: №1 и №3 — разные стороны»; в редакторе выбирается новая пара', async () => {
  const { app, user } = renderApp((a) => { summaryOf(TABLE, [['journalist_compare', 2, 1, 3]])(a) })
  await user.click(screen.getByRole('button', { name: /Журналист: №1 и №3 — разные стороны/ }))
  const dialog = within(screen.getByRole('dialog'))
  // Себя и запертых в редакторе выбрать нельзя; пара записывается вторым кликом.
  expect(dialog.getByRole('button', { name: 'Выбрать игрока №2' })).toBeDisabled()
  expect(dialog.getByRole('button', { name: 'Выбрать игрока №1' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(dialog.getByRole('button', { name: 'Выбрать игрока №9' }))
  expect(step(app)).toMatchObject({ target: 1, target2: 3 })
  await user.click(dialog.getByRole('button', { name: 'Выбрать игрока №11' }))
  expect(step(app)).toMatchObject({ target: 9, target2: 11 }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Журналист: №9 и №11 — одна сторона/ })).toBeInTheDocument()
  record(app, ['prostitute_block', 10, 2])
  expect(await screen.findByRole('button', { name: /Журналист: №9 и №11 — заблокирован, проверка не состоялась/ })).toBeInTheDocument()
})
test('шаг журналиста по-украински', () => {
  renderApp((a) => { nightOf(TABLE, [['journalist_compare', 2, 1, 3]], STEP)(a); a.setSettings({ lang: 'uk' }) })
  expect(screen.getByText('Кого порівнює журналіст? Обери двох')).toBeInTheDocument()
  expect(document.querySelector('.answer')).toHaveTextContent('Різні сторони')
})
