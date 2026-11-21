import { act, screen, within } from '@testing-library/react'
import type { AppStore } from '../../src/app/store'
import type { SessionConfig } from '../../src/engine'
import { advance, renderApp } from './helpers'
import { card, leaving, nightOf, staying, summaryOf } from './roleNights'

// Маньяк на экране. Стол: №1 шериф, №2 маньяк, №3 крёстный отец, №4 доктор, №5 бронежилет, №6 охранник, №8 мафия, №10 проститутка.
const TABLE = 'S maniac G D bulletproof bodyguard c M c P c'
/** День 2 после визита маньяка к №7: утро объявлено, роли скрыты (как в игре днём). */
const day2 = (config?: Partial<SessionConfig>, announce = true) => (a: AppStore) => {
  nightOf(TABLE, [['maniac_visit', 2, 7]], undefined, config)(a)
  a.dispatch({ type: 'confirmNight', died: [] })
  if (announce) a.dispatch({ type: 'announceMorning' })
}
/** Ночь 2 после визита к №7 в Ночь 1, открыт шаг маньяка. */
const night2 = (config?: Partial<SessionConfig>) => (a: AppStore) => {
  day2(config)(a); a.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 2 } }); a.dispatch({ type: 'enterStep', step: 'maniac_visit:2' })
}

test('шаг маньяка: вопрос, запись, ответ «Первый визит — №7 завтра молчит», метка на карточке', async () => {
  const { app, user } = renderApp(nightOf(TABLE, [], 'maniac_visit:2'))
  expect(screen.getByText('К кому приходит маньяк?')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №7' }))
  expect(app.getState().game!.night!.steps.find((s) => s.id === 'maniac_visit:2')).toMatchObject({ target: 7, answer: { kind: 'visit', lethal: false } })
  const answer = document.querySelector('.answer') as HTMLElement
  expect(answer).toHaveTextContent('Первый визит'); expect(answer).toHaveTextContent('№7 завтра молчит')
  expect(within(card(7)).getByText('визит маньяка')).toBeInTheDocument()
})
test('вторая ночь подряд к той же жертве — предупреждение и «Записать всё равно»; повторный визит назван нападением', async () => {
  const { app, user } = renderApp(night2())
  expect(screen.getByText(/Прошлой ночью: №7 — первый визит/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №7' }))
  expect(screen.getByText('К этому игроку маньяк приходил прошлой ночью')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Записать всё равно' }))
  expect(app.getState().game!.night!.steps.find((s) => s.id === 'maniac_visit:2')).toMatchObject({ target: 7, answer: { kind: 'visit', lethal: true } })
  const answer = document.querySelector('.answer') as HTMLElement
  expect(answer).toHaveTextContent('Повторный визит'); expect(answer).toHaveTextContent('№7 выбывает, если его не спасут')
})
test('опция «не ходит к одной жертве две ночи подряд» выключена — предупреждения нет', async () => {
  const { app, user } = renderApp(night2({ roleOptions: { maniac_no_repeat: false } }))
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №7' }))
  expect(screen.queryByText('К этому игроку маньяк приходил прошлой ночью')).not.toBeInTheDocument()
  expect(app.getState().game!.night!.steps.find((s) => s.id === 'maniac_visit:2')).toMatchObject({ target: 7 })
})
test('итог ночи: первый визит — «Жертва маньяка · первый визит · днём молчит»; повторный — «Убит маньяком»', () => {
  const first = renderApp(summaryOf(TABLE, [['maniac_visit', 2, 7]]))
  expect(within(staying()!).getByText('Жертва маньяка')).toBeInTheDocument(); expect(within(staying()!).getByText('первый визит · днём молчит')).toBeInTheDocument()
  expect(within(leaving()).getByText('Никто не покидает стол')).toBeInTheDocument()
  first.unmount()
  renderApp((a) => {
    night2()(a); a.dispatch({ type: 'recordNightAction', actionId: 'maniac_visit', actor: 2, target: 7, force: true }); a.dispatch({ type: 'enterStep', step: 'summary' })
  })
  expect(within(leaving()).getByText('Убит маньяком')).toBeInTheDocument()
  expect(within(leaving()).getByText('повторный визит · никто не лечил и не защищал')).toBeInTheDocument()
})
test('маньяк заблокирован: «Визита этой ночью не будет»', () => {
  renderApp(nightOf(TABLE, [['prostitute_block', 10, 2], ['maniac_visit', 2, 7]], 'maniac_visit:2'))
  expect(screen.getByRole('alert')).toHaveTextContent('№2 заблокирован'); expect(screen.getByRole('alert')).toHaveTextContent('Визита этой ночью не будет.')
  expect(document.querySelector('.answer')).toBeNull()
})
test('утро: «№7 сегодня молчит»; с опциями — «не выставляет» и «не голосует»; ролей в окне нет', () => {
  const plain = renderApp(day2(undefined, false))
  const lines = () => within(screen.getByRole('dialog', { name: 'Объяви столу' })).getAllByRole('listitem').map((li) => li.textContent)
  expect(lines()).toEqual(['№7сегодня молчит'])
  expect(screen.getByRole('dialog', { name: 'Объяви столу' })).not.toHaveTextContent(/маньяк/i)
  plain.unmount()
  renderApp(day2({ roleOptions: { maniac_no_nominate: true, maniac_no_vote: true } }, false))
  expect(lines()).toEqual(['№7сегодня молчит, не выставляет, не голосует'])
})
test('метка «молчит» на карточке жертвы видна при скрытых ролях — и только в этот день', async () => {
  const { app } = renderApp(day2())
  expect(app.getState().settings.rolesHidden).toBe(true)
  expect(within(card(7)).getByText('молчит')).toBeInTheDocument(); expect(card(7)).toHaveClass('card-silenced')
  expect(within(card(6)).queryByText('молчит')).not.toBeInTheDocument()
  // Ни роль жертвы, ни ночной выбор маньяка при скрытых ролях не видны.
  expect(screen.queryByText(/визит маньяка|маньяк/)).not.toBeInTheDocument()
  act(() => { app.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 2 } }); app.dispatch({ type: 'confirmNight', died: [] }); app.dispatch({ type: 'announceMorning' }) })
  expect(app.getState().game!.phase).toEqual({ kind: 'day', n: 3 })
  expect(within(card(7)).queryByText('молчит')).not.toBeInTheDocument(); expect(card(7)).not.toHaveClass('card-silenced')
})
test('круг речей: очередь жертвы проходит без таймера; в свой ход она может выставить; дальше слово идёт следующему', async () => {
  const { app, user, env } = renderApp((a) => { day2()(a); a.dispatch({ type: 'enterStep', step: 'speeches' }); a.dispatch({ type: 'openCircle', first: 6 }); a.speak('speech', 6) })
  expect(screen.getByRole('timer')).toBeInTheDocument()
  // Говорит №6, следующая по кругу — жертва: главная кнопка называет ход без речи.
  advance(env, 500); await user.click(screen.getByRole('button', { name: /№7 молчит · ход без речи/ }))
  expect(app.getState().game!.day!.speaking).toMatchObject({ kind: 'silent', seat: 7 }); expect(app.getState().session!.timer).toBeNull()
  expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  expect(screen.getByText('№7 сегодня молчит')).toBeInTheDocument(); expect(screen.getByText('Своей минуты в круге у него нет.')).toBeInTheDocument()
  // Пробел таймер не запускает: его у жертвы нет.
  await user.keyboard(' '); expect(app.getState().session!.timer).toBeNull()
  await user.click(screen.getByRole('button', { name: '№7 выставляет…' })); await user.click(screen.getByRole('button', { name: 'Выбрать игрока №9' }))
  expect(app.getState().game!.day!.nominations).toMatchObject([{ target: 9, by: 7 }])
  advance(env, 500); await user.click(screen.getByRole('button', { name: /Следующий: №8 · 60 с/ }))
  expect(app.getState().game!.day).toMatchObject({ speaking: { kind: 'speech', seat: 8 }, spoken: [6, 7] })
  expect(screen.getByRole('timer')).toBeInTheDocument()
})
test('опция «жертва не выставляет»: в её ход кнопки «№7 выставляет…» нет', async () => {
  const { user, env } = renderApp((a) => {
    day2({ roleOptions: { maniac_no_nominate: true } })(a); a.dispatch({ type: 'enterStep', step: 'speeches' }); a.dispatch({ type: 'openCircle', first: 7 })
  })
  advance(env, 500); await user.click(screen.getByRole('button', { name: /№7 молчит · ход без речи/ }))
  expect(screen.getByText('№7 сегодня молчит')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '№7 выставляет…' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Следующий: №8 · 60 с/ })).toBeInTheDocument()
})
test('оправдание и прощание у жертвы — с обычным таймером', async () => {
  const { app, user, env } = renderApp((a) => { day2()(a); a.dispatch({ type: 'nominate', by: 1, target: 7 }); a.dispatch({ type: 'enterStep', step: 'defense' }) })
  advance(env, 500); await user.click(screen.getByRole('button', { name: /Оправдание №7 · 30 с/ }))
  expect(screen.getByText('Оправдание №7')).toBeInTheDocument(); expect(app.getState().session!.timer).toMatchObject({ kind: 'defense', seat: 7, status: 'running' })
  advance(env, 500); await user.click(screen.getByRole('button', { name: /№7 выгнан → прощание · 30 с/ }))
  advance(env, 500); await user.click(screen.getByRole('button', { name: /Прощание №7 · 30 с/ }))
  expect(app.getState().session!.timer).toMatchObject({ kind: 'farewell', seat: 7, status: 'running' })
})
test('опция «жертва не голосует»: голосующих на одного меньше, строка называет, кто не голосует', () => {
  const voting = (config?: Partial<SessionConfig>) => (a: AppStore) => {
    day2(config)(a); a.dispatch({ type: 'nominate', by: 1, target: 3 }); a.dispatch({ type: 'nominate', by: 3, target: 9 }); a.dispatch({ type: 'enterStep', step: 'vote' })
  }
  const plain = renderApp(voting())
  expect(screen.getByText(/голосуют 11 · осталось 11/)).toBeInTheDocument(); expect(screen.queryByText(/не голосует/)).not.toBeInTheDocument()
  plain.unmount()
  const { app } = renderApp(voting({ roleOptions: { maniac_no_vote: true } }))
  expect(screen.getByText(/голосуют 10 · осталось 10/)).toBeInTheDocument(); expect(screen.getByText('№7 сегодня не голосует')).toBeInTheDocument()
  // Жертва выбыла вручную: голосующих — по числу игроков в игре, строки нет.
  act(() => { app.dispatch({ type: 'setStatus', seat: 7, status: 'out', cause: 'shot' }) })
  expect(screen.getByText(/голосуют 10 · осталось 10/)).toBeInTheDocument(); expect(screen.queryByText(/не голосует/)).not.toBeInTheDocument()
})
