import { act, screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import type { AppStore } from '../../src/app/store'
import { TABLE_11 } from '../helpers'
import { advance, renderApp, seedGame } from './helpers'
import { nightOf } from './roleNights'

// Фолы на экране: кнопка в панели игрока, счёт на карточке, окно подтверждения наказания на третьем фоле.

/** День 2, шаг «Круг речей», круг открыт с №3. times — сколько фолов уже у №7. */
const day2 = (times = 0) => (a: AppStore) => {
  seedGame(a, TABLE_11, 2)
  a.dispatch({ type: 'openCircle', first: 3 }); a.dispatch({ type: 'enterStep', step: 'speeches' })
  for (let i = 0; i < times; i++) a.dispatch({ type: 'giveFoul', seat: 7 })
}
const panel = (n: number) => screen.getByRole('group', { name: `Игрок №${n}` })
const openPanel = async (user: UserEvent, n: number) => user.click(screen.getByRole('button', { name: `Игрок №${n}` }))
const foul = async (user: UserEvent, n: number) => { await openPanel(user, n); await user.click(within(panel(n)).getByRole('button', { name: 'Фол' })) }
const marks = (n: number) => [...document.querySelectorAll('.table-grid .card')[n - 1]!.querySelectorAll('.card-mark')].map((el) => el.textContent)
const dialog = () => screen.getByRole('dialog', { name: 'Наказание за фолы' })
const noDialog = () => expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

test('фол из панели игрока: счёт на карточке и в панели; «Снять фол» возвращает счёт', async () => {
  const { app, user } = renderApp(day2())
  await openPanel(user, 7)
  expect(within(panel(7)).queryByRole('button', { name: 'Снять фол' })).not.toBeInTheDocument()
  await user.click(within(panel(7)).getByRole('button', { name: 'Фол' }))
  // Панель закрылась, фол записан и виден на карточке.
  expect(screen.queryByRole('group', { name: 'Игрок №7' })).not.toBeInTheDocument()
  expect(app.getState().game!.fouls.counts[6]).toBe(1); expect(marks(7)).toEqual(['фолы: 1'])
  await foul(user, 7); expect(marks(7)).toEqual(['фолы: 2']); noDialog()
  await openPanel(user, 7); expect(within(panel(7)).getByText('Фолы за игру: 2')).toBeInTheDocument()
  await user.click(within(panel(7)).getByRole('button', { name: 'Снять фол' }))
  expect(app.getState().game!.fouls.counts[6]).toBe(1); expect(marks(7)).toEqual(['фолы: 1'])
})

test('третий фол открывает окно; «Применить наказание» — игрок сегодня молчит, но в свой ход может выставить', async () => {
  const { app, user, env } = renderApp(day2(2))
  await foul(user, 7)
  expect(app.getState().game!.fouls.counts[6]).toBe(3)
  expect(dialog()).toHaveTextContent('№7 — 3 фола')
  expect(dialog()).toHaveTextContent('Сегодня №7 не говорит: его очередь в круге пройдёт без речи.')
  expect(dialog()).toHaveTextContent('Выставить на голосование он может.')
  expect(dialog()).toHaveTextContent('Фол записан в любом случае.')
  advance(env, 500)
  await user.click(within(dialog()).getByRole('button', { name: /Применить наказание/ }))
  noDialog()
  expect(app.getState().game!.day).toMatchObject({ penalized: [7], muted: [7] })
  expect(marks(7)).toEqual(['молчит', 'фолы: 3'])
  // Круг доходит до №7: ход без речи и без таймера, выставить он может.
  act(() => { for (const seat of [3, 4, 5, 6]) app.dispatchAll([{ type: 'startSpeech', kind: 'speech', seat }, { type: 'endSpeech' }]) })
  advance(env, 500)
  await user.click(screen.getByRole('button', { name: '№7 молчит · ход без речи' }))
  expect(app.getState().game!.day!.speaking).toMatchObject({ kind: 'silent', seat: 7 })
  expect(app.getState().session!.timer).toBeNull()
  expect(screen.getByText('№7 сегодня молчит')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '№7 выставляет…' }))
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №9' }))
  expect(app.getState().game!.day!.nominations).toMatchObject([{ by: 7, target: 9 }])
  advance(env, 500)
  expect(screen.getByRole('button', { name: /Следующий: №8/ })).toBeInTheDocument()
})

test('«Не применять»: окно закрыто, фолы остались, игрок говорит как все', async () => {
  const { app, user, env } = renderApp(day2(2))
  await foul(user, 7); advance(env, 500)
  await user.click(within(dialog()).getByRole('button', { name: 'Не применять' }))
  noDialog()
  expect(app.getState().game!.fouls).toMatchObject({ pending: [], penalties: [{ seat: 7, level: 3, applied: false }] })
  expect(app.getState().game!.day!.muted).toEqual([]); expect(marks(7)).toEqual(['фолы: 3'])
})

test('«Отменить фол» в окне снимает третий фол; Enter применяет наказание не раньше, чем через 0,4 с', async () => {
  const { app, user, env } = renderApp(day2(2))
  await foul(user, 7)
  await user.click(within(dialog()).getByRole('button', { name: 'Отменить фол' }))
  noDialog(); expect(app.getState().game!.fouls.counts[6]).toBe(2)
  await foul(user, 7)
  await user.keyboard('{Enter}'); expect(dialog()).toBeInTheDocument()
  advance(env, 500); await user.keyboard('{Enter}')
  noDialog(); expect(app.getState().game!.day!.muted).toEqual([7])
})

test('третий фол после своей речи: окно называет следующий день; сегодня игрок не молчит', async () => {
  const { app, user, env } = renderApp((a) => {
    day2()(a); a.dispatchAll([{ type: 'startSpeech', kind: 'speech', seat: 3 }, { type: 'endSpeech' }])
    a.dispatch({ type: 'giveFoul', seat: 3 }); a.dispatch({ type: 'giveFoul', seat: 3 })
  })
  await foul(user, 3)
  expect(dialog()).toHaveTextContent('В День 3 №3 не говорит: его очередь в круге пройдёт без речи.')
  advance(env, 500); await user.click(within(dialog()).getByRole('button', { name: /Применить наказание/ }))
  expect(app.getState().game!.day!.muted).toEqual([]); expect(marks(3)).toEqual(['говорил · начинал день', 'фолы: 3'])
  await openPanel(user, 3)
  expect(within(panel(3)).getByText('3 фола · День 3 без речи')).toBeInTheDocument()
})

test('решение меняется в панели игрока: «Отменить наказание» и «Применить наказание»', async () => {
  const { app, user } = renderApp((a) => { day2(3)(a); a.dispatch({ type: 'decideFoulPenalty', seat: 7, apply: true }) })
  await openPanel(user, 7)
  expect(within(panel(7)).getByText('3 фола · День 2 без речи')).toBeInTheDocument()
  await user.click(within(panel(7)).getByRole('button', { name: 'Отменить наказание' }))
  expect(app.getState().game!.day!.muted).toEqual([]); noDialog()
  await openPanel(user, 7)
  expect(within(panel(7)).getByText('3 фола · наказание не применено')).toBeInTheDocument()
  await user.click(within(panel(7)).getByRole('button', { name: 'Применить наказание' }))
  expect(app.getState().game!.day!.muted).toEqual([7])
})

test('выбывшему фол дать нельзя; счёт фолов виден и при скрытых ролях', async () => {
  const { user } = renderApp((a) => {
    day2(1)(a); a.dispatch({ type: 'setStatus', seat: 9, status: 'out', cause: 'voted' }); a.setSettings({ rolesHidden: true })
  })
  expect(marks(7)).toEqual(['фолы: 1'])
  await openPanel(user, 9)
  expect(within(panel(9)).getByRole('button', { name: 'Фол' })).toBeDisabled()
})

test('ночью фол даётся так же; третий фол ночью — наказание на следующий день, утром окно называет наказанного', async () => {
  const { app, user, env } = renderApp((a) => {
    nightOf(TABLE_11)(a); a.dispatch({ type: 'giveFoul', seat: 9 }); a.dispatch({ type: 'giveFoul', seat: 9 })
  })
  await user.click(screen.getByRole('button', { name: 'Панель игрока №9' }))
  await user.click(within(panel(9)).getByRole('button', { name: 'Фол' }))
  expect(dialog()).toHaveTextContent('В День 2 №9 не говорит')
  advance(env, 500); await user.click(within(dialog()).getByRole('button', { name: /Применить наказание/ }))
  noDialog()
  act(() => { app.dispatch({ type: 'confirmNight', died: [] }) })
  const morning = screen.getByRole('dialog', { name: 'Объяви столу' })
  expect(within(morning).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['№9сегодня молчит — наказание за фолы'])
  expect(app.getState().game!.day!.muted).toEqual([9])
})

test('жертва маньяка с опцией «не выставляет» выставить не может, а наказанный за фолы — может', async () => {
  const TABLE = 'S maniac G D bulletproof bodyguard c M c P c'
  const { app, user, env } = renderApp((a) => {
    nightOf(TABLE, [['maniac_visit', 2, 7]], undefined, { roleOptions: { maniac_no_nominate: true } })(a)
    a.dispatch({ type: 'confirmNight', died: [] }); a.dispatch({ type: 'announceMorning' })
    a.dispatch({ type: 'openCircle', first: 7 }); a.dispatch({ type: 'enterStep', step: 'speeches' })
    for (let i = 0; i < 3; i++) a.dispatch({ type: 'giveFoul', seat: 8 })
    a.dispatch({ type: 'decideFoulPenalty', seat: 8, apply: true })
  })
  expect(app.getState().game!.day).toMatchObject({ silenced: [7], penalized: [8], muted: [7, 8] })
  advance(env, 500); await user.click(screen.getByRole('button', { name: '№7 молчит · ход без речи' }))
  expect(screen.queryByRole('button', { name: '№7 выставляет…' })).not.toBeInTheDocument()
  advance(env, 500); await user.click(screen.getByRole('button', { name: '№8 молчит · ход без речи' }))
  expect(screen.getByRole('button', { name: '№8 выставляет…' })).toBeInTheDocument()
})

test('окно наказания — на украинском', async () => {
  const { user } = renderApp((a) => { day2(2)(a); a.setSettings({ lang: 'uk' }) })
  await user.click(screen.getByRole('button', { name: 'Гравець №7' }))
  await user.click(within(screen.getByRole('group', { name: 'Гравець №7' })).getByRole('button', { name: 'Фол' }))
  const box = screen.getByRole('dialog', { name: 'Покарання за фоли' })
  expect(box).toHaveTextContent('№7 — 3 фоли')
  expect(within(box).getByRole('button', { name: /Застосувати покарання/ })).toBeInTheDocument()
  expect(within(box).getByRole('button', { name: 'Не застосовувати' })).toBeInTheDocument()
})

test('вопрос о наказании появился не от фола (игрок с тремя фолами вернулся в игру) — «Отменить фол» в окне нет', () => {
  renderApp((a) => {
    day2(3)(a)
    a.dispatch({ type: 'setStatus', seat: 7, status: 'out', cause: 'voted' }); a.dispatch({ type: 'setStatus', seat: 7, status: 'alive' })
  })
  expect(dialog()).toHaveTextContent('№7 — 3 фола')
  expect(within(dialog()).queryByRole('button', { name: 'Отменить фол' })).not.toBeInTheDocument()
  expect(within(dialog()).getByRole('button', { name: 'Не применять' })).toBeInTheDocument()
})
