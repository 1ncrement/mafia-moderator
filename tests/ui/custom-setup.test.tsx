import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { advance, renderApp } from './helpers'

const open = async (user: UserEvent) => user.click(screen.getByRole('button', { name: /Добавить свою роль/ }))
const form = () => within(screen.getByRole('form', { name: 'Новая роль' }))

test('добавление роли: строка в перечне, колода, счётчик стороны, порядок ночи', async () => {
  const { app, user } = renderApp((a) => a.newGame())
  await open(user)
  await user.type(form().getByLabelText('Название'), 'Адвокат')
  await user.click(form().getByRole('radio', { name: 'Красные' }))
  await user.click(form().getByRole('button', { name: 'Добавить роль' }))
  expect(screen.queryByRole('form', { name: 'Новая роль' })).not.toBeInTheDocument()
  expect(app.getState().settings.customRoles).toMatchObject([{ name: 'Адвокат', night: true }])
  expect(screen.getByRole('switch', { name: 'Адвокат участвует в игре' })).toBeChecked()
  expect(screen.getByText('своя роль')).toBeInTheDocument()
  // Стандартный состав на 10 игроков: чёрных 2, красных 8. Красная роль заняла место мирного — счётчики те же.
  expect(screen.getByText('чёрных 2')).toBeInTheDocument(); expect(screen.getByText('красных 8')).toBeInTheDocument()
  expect(within(screen.getByRole('list', { name: 'Колода' })).getByText('адвокат')).toBeInTheDocument()
  // Мафия, крёстный отец, проститутка, шериф, доктор — и шестым шаг своей роли.
  const order = within(screen.getByRole('list', { name: 'Ночью просыпаются' })).getAllByRole('listitem').map((li) => li.textContent)
  expect(order.at(-1)).toBe('6 · адвокат')
})
test('Enter в поле названия добавляет роль и не раздаёт карты; Escape закрывает форму', async () => {
  const { app, user } = renderApp((a) => a.newGame())
  await open(user); await user.type(form().getByLabelText('Название'), 'Оборотень{Enter}')
  expect(app.getState().screen).toBe('setup'); expect(app.getState().settings.customRoles).toHaveLength(1)
  await open(user); await user.type(form().getByLabelText('Название'), 'черновик{Escape}')
  expect(screen.queryByRole('form', { name: 'Новая роль' })).not.toBeInTheDocument(); expect(app.getState().settings.customRoles).toHaveLength(1)
})
test('ошибки названия показаны строкой, форма остаётся открытой', async () => {
  const { user } = renderApp((a) => a.newGame())
  await open(user); await user.click(form().getByRole('button', { name: 'Добавить роль' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Введите название роли.')
  await user.type(form().getByLabelText('Название'), 'шериф{Enter}')
  expect(screen.getByRole('alert')).toHaveTextContent('Роль с таким названием уже есть.')
})
test('название показывается как текст и не переводится', async () => {
  const { user } = renderApp((a) => { a.newGame(); a.addCustomRole({ name: '<b>жирный</b>', side: a.registry.sides[0]!.id, night: false }) })
  expect(screen.getByText('<b>жирный</b>', { selector: '.role-row-name' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'На главную' })); await user.click(screen.getByRole('button', { name: 'Українська' }))
  await user.click(screen.getByRole('button', { name: /Нова гра/ }))
  expect(screen.getByText('<b>жирный</b>', { selector: '.role-row-name' })).toBeInTheDocument()
  expect(screen.getByText(/уночі спить/)).toBeInTheDocument()
})
test('изменить и удалить', async () => {
  const { app, user } = renderApp((a) => { a.newGame(); a.addCustomRole({ name: 'Адвокат', side: a.registry.sides[1]!.id, night: true }) })
  await user.click(screen.getByRole('button', { name: 'Изменить роль «Адвокат»' }))
  const edit = within(screen.getByRole('form', { name: 'Изменить роль' }))
  await user.clear(edit.getByLabelText('Название')); await user.type(edit.getByLabelText('Название'), 'Репортёр')
  await user.click(edit.getByRole('switch', { name: 'Ходит ночью' })); await user.click(edit.getByRole('button', { name: 'Сохранить' }))
  expect(app.getState().settings.customRoles).toMatchObject([{ name: 'Репортёр', night: false }])
  expect(screen.queryByText(/репортёр/, { selector: '.night-order li' })).not.toBeInTheDocument()   // роль больше не ходит ночью
  await user.click(screen.getByRole('button', { name: 'Удалить роль «Репортёр»' }))
  expect(app.getState().settings.customRoles).toEqual([])
})
test('ролей больше, чем игроков, — раздать нельзя; мирных 0 — можно', async () => {
  const { app, user } = renderApp((a) => { a.newGame(); a.editDraft({ playerCount: 4 }); a.addCustomRole({ name: 'Адвокат', side: a.registry.sides[1]!.id, night: true }) })
  expect(screen.getByRole('alert')).toHaveTextContent('ролей на 1 больше, чем игроков')
  expect(screen.getByRole('button', { name: /Раздать роли/ })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Больше игроков' }))
  expect(screen.getByRole('button', { name: /Раздать роли/ })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: /Раздать роли/ }))
  expect(app.getState().screen).toBe('deal'); expect(app.getState().session!.config.customRoles).toHaveLength(1)
})
test('восемь ролей — кнопки добавления нет, есть строка о пределе', () => {
  renderApp((a) => { a.newGame(); for (let i = 0; i < 8; i++) a.addCustomRole({ name: `роль ${i}`, side: a.registry.sides[0]!.id, night: false }) })
  expect(screen.queryByRole('button', { name: /Добавить свою роль/ })).not.toBeInTheDocument()
  expect(screen.getByText('Своих ролей может быть не больше 8.')).toBeInTheDocument()
})
test('«Сбросить к стандарту» выключает свою роль, но оставляет её в перечне', async () => {
  const { app, user } = renderApp((a) => { a.newGame(); a.addCustomRole({ name: 'Адвокат', side: a.registry.sides[1]!.id, night: true }) })
  await user.click(screen.getByRole('button', { name: 'Сбросить к стандарту' }))
  expect(screen.getByRole('switch', { name: 'Адвокат участвует в игре' })).not.toBeChecked()
  expect(app.getState().settings.customRoles).toHaveLength(1)
})

// ── Сверх плана ─────────────────────────────────────────────────────────────

test('пока форма роли открыта, Enter на её кнопке не раздаёт карты', async () => {
  const { app, user } = renderApp((a) => a.newGame())
  await open(user); await user.click(form().getByRole('radio', { name: 'Красные' }))
  await user.keyboard('{Enter}')
  expect(app.getState().screen).toBe('setup')
  expect(form().getByRole('radio', { name: 'Красные' })).toBeChecked()
})
test('открыта одна форма: «Изменить» закрывает форму новой роли и показывает значения роли', async () => {
  const { user } = renderApp((a) => { a.newGame(); a.addCustomRole({ name: 'Адвокат', side: a.registry.sides[1]!.id, night: false }) })
  await open(user)
  await user.click(screen.getByRole('button', { name: 'Изменить роль «Адвокат»' }))
  expect(screen.queryByRole('form', { name: 'Новая роль' })).not.toBeInTheDocument()
  const edit = within(screen.getByRole('form', { name: 'Изменить роль' }))
  expect(edit.getByLabelText('Название')).toHaveValue('Адвокат')
  expect(edit.getByRole('radio', { name: 'Красные' })).toBeChecked(); expect(edit.getByRole('radio', { name: 'Чёрные' })).not.toBeChecked()
  expect(edit.getByRole('switch', { name: 'Ходит ночью' })).not.toBeChecked()
  // Строки роли на время правки нет: форма стоит на её месте.
  expect(screen.queryByRole('switch', { name: 'Адвокат участвует в игре' })).not.toBeInTheDocument()
  await user.click(edit.getByRole('button', { name: 'Отмена' }))
  expect(screen.getByRole('switch', { name: 'Адвокат участвует в игре' })).toBeInTheDocument()
})
test('название с пробелами по краям и длиннее 24 знаков обрезается; чужой регистр и язык — совпадение', async () => {
  const { app, user } = renderApp((a) => a.newGame())
  await open(user); await user.type(form().getByLabelText('Название'), '  Очень-длинное-название-роли-без-пробелов{Enter}')
  expect(app.getState().settings.customRoles[0]!.name).toBe('Очень-длинное-название')
  await open(user); await user.type(form().getByLabelText('Название'), 'ЛІКАР{Enter}')
  expect(screen.getByRole('alert')).toHaveTextContent('Роль с таким названием уже есть.')
  await user.clear(form().getByLabelText('Название')); await user.type(form().getByLabelText('Название'), 'л')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()   // ошибка снята, как только название изменили
})
test('пояснение под выбором стороны называет счётчик и ответ шерифа; своя роль без ночного шага в порядок ночи не попадает', async () => {
  const { user } = renderApp((a) => a.newGame())
  await open(user)
  expect(form().getByText('Идёт в счётчик чёрных. Шериф при проверке видит её чёрной.')).toBeInTheDocument()
  await user.click(form().getByRole('radio', { name: 'Красные' }))
  expect(form().getByText('Идёт в счётчик красных. Шериф при проверке видит её красной.')).toBeInTheDocument()
  await user.click(form().getByRole('switch', { name: 'Ходит ночью' })); await user.type(form().getByLabelText('Название'), 'Свидетель{Enter}')
  expect(within(screen.getByRole('list', { name: 'Ночью просыпаются' })).getAllByRole('listitem')).toHaveLength(5)
  expect(screen.getByText(/красные · ночью спит/)).toBeInTheDocument()
})
test('никто не ходит ночью — вместо списка строка', () => {
  renderApp((a) => { a.newGame(); a.editDraft({ composition: {} }) })
  expect(screen.queryByRole('list', { name: 'Ночью просыпаются' })).not.toBeInTheDocument()
  expect(screen.getByText('Ночью никто не просыпается.')).toBeInTheDocument()
})

// ── По итогам независимого ревью ────────────────────────────────────────────

test('двойной Enter после названия роли карты не раздаёт; через полсекунды Enter снова раздаёт', async () => {
  const { app, user, env } = renderApp((a) => a.newGame())
  await open(user); await user.type(form().getByLabelText('Название'), 'Оборотень{Enter}')
  await user.keyboard('{Enter}')
  expect(app.getState().screen).toBe('setup'); expect(app.getState().settings.customRoles).toHaveLength(1)
  advance(env, 500); await user.keyboard('{Enter}')
  expect(app.getState().screen).toBe('deal')
})
test('Escape закрывает форму роли и когда фокус не в ней', async () => {
  const { app, user } = renderApp((a) => a.newGame())
  await open(user); await user.type(form().getByLabelText('Название'), 'черновик')
  await user.click(screen.getByText('Игроков за столом'))          // фокус ушёл из формы
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('form', { name: 'Новая роль' })).not.toBeInTheDocument()
  expect(app.getState().settings.customRoles).toEqual([])
})

test('аббревиатура в названии остаётся прописной в колоде и в порядке ночи, обычное название — со строчной', () => {
  renderApp((a) => {
    a.newGame()
    a.addCustomRole({ name: 'КГБ', side: a.registry.sides[0]!.id, night: true })
    a.addCustomRole({ name: 'Адвокат', side: a.registry.sides[1]!.id, night: true })
  })
  const deck = within(screen.getByRole('list', { name: 'Колода' }))
  expect(deck.getByText('КГБ')).toBeInTheDocument(); expect(deck.getByText('адвокат')).toBeInTheDocument()
  const order = within(screen.getByRole('list', { name: 'Ночью просыпаются' })).getAllByRole('listitem').map((li) => li.textContent)
  expect(order.slice(-2)).toEqual(['6 · КГБ', '7 · адвокат'])
  // В строке роли название стоит в начале — с заглавной.
  expect(screen.getByRole('switch', { name: 'Адвокат участвует в игре' })).toBeInTheDocument()
})
