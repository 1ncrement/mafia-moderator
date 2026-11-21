import { act, fireEvent, screen } from '@testing-library/react'
import type { AppStore } from '../../src/app/store'
import { TABLE_11 } from '../helpers'
import { advance, renderApp, seedGame, sleep } from './helpers'

const speaking = (a: AppStore) => { seedGame(a, TABLE_11, 1); a.dispatch({ type: 'openCircle', first: 5 }); a.speak('speech', 5) }
test('сигнал звучит один раз на нуле и не повторяется', () => {
  const { env } = renderApp(speaking)
  advance(env, 59_000); expect(env.beep).not.toHaveBeenCalled()
  advance(env, 1_500); expect(env.beep).toHaveBeenCalledTimes(1)
  advance(env, 30_000); expect(env.beep).toHaveBeenCalledTimes(1)
})
test('после сна таймер сразу показывает перерасход, сигнал один', () => {
  const { env } = renderApp(speaking)
  sleep(env, 300_000)
  expect(screen.getByText('+4:00')).toBeInTheDocument(); expect(env.beep.mock.calls.length).toBeLessThanOrEqual(1)
})
test('звук выключен — сигнала нет', () => {
  const { env } = renderApp((a) => { speaking(a); a.setSettings({ sound: false }) })
  advance(env, 61_000); expect(env.beep).not.toHaveBeenCalled()
})
test('двойное нажатие и автоповтор Enter не проскакивают шаг', async () => {
  const { app, user, env } = renderApp(speaking)
  await user.keyboard('{Enter}'); await user.keyboard('{Enter}')
  expect(app.getState().game!.day!.speaking).toMatchObject({ seat: 6 })
  advance(env, 500); fireEvent.keyDown(screen.getByRole('main'), { key: 'Enter', repeat: true })
  expect(app.getState().game!.day!.speaking).toMatchObject({ seat: 6 })
})
test('пробел ставит таймер на паузу; Cmd+Z отменяет; H прячет роли', async () => {
  const { app, user } = renderApp(speaking)
  await user.keyboard(' '); expect(app.getState().session!.timer!.status).toBe('paused')
  await user.keyboard('{Meta>}z{/Meta}'); expect(app.getState().game!.day!.speaking).toBeNull()
  await user.keyboard('h'); expect(app.getState().settings.rolesHidden).toBe(true)
})
test('клавиши не действуют под открытым окном', async () => {
  const { app, user } = renderApp(speaking)
  await user.click(screen.getByRole('button', { name: 'Меню' })); await user.click(screen.getByRole('menuitem', { name: 'Остановить игру' }))
  await user.keyboard('{Enter}'); await user.keyboard(' ')
  expect(app.getState().game!.day!.speaking).toMatchObject({ seat: 5 }); expect(app.getState().session!.timer!.status).toBe('running')
})

// Сверх плана
test('двойной клик мышью по главной кнопке тоже не проскакивает шаг', async () => {
  const { app, user, env } = renderApp(speaking)
  await user.dblClick(screen.getByRole('button', { name: /Следующий: №6/ }))
  expect(app.getState().game!.day!.speaking).toMatchObject({ seat: 6 })
  advance(env, 500); await user.click(screen.getByRole('button', { name: /Следующий: №7/ }))
  expect(app.getState().game!.day!.speaking).toMatchObject({ seat: 7 })
})
test('Esc закрывает панель игрока и выходит из режима выбора; клавиши молчат в поле ввода и на паузе', async () => {
  const { app, user } = renderApp((a) => { seedGame(a, TABLE_11, 1) })
  await user.click(screen.getByRole('button', { name: 'Игрок №3' })); expect(screen.getByRole('group', { name: 'Игрок №3' })).toBeInTheDocument()
  await user.keyboard('{Escape}'); expect(screen.queryByRole('group', { name: 'Игрок №3' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Выбрать, кто начинает' })); expect(screen.getByRole('button', { name: 'Выбрать игрока №5' })).toBeInTheDocument()
  await user.keyboard('{Escape}'); expect(screen.queryByRole('button', { name: 'Выбрать игрока №5' })).not.toBeInTheDocument()
  const input = document.createElement('input'); document.body.append(input); input.focus()
  await user.keyboard('h'); expect(app.getState().settings.rolesHidden).toBe(false); input.remove()
  await user.click(screen.getByRole('button', { name: 'Пауза игры' })); await user.keyboard('h')
  expect(app.getState().settings.rolesHidden).toBe(false)
})
test('экран не гаснет, пока идёт игра, и отпускается на паузе', async () => {
  const { user, env } = renderApp((a) => seedGame(a, TABLE_11, 1))
  expect(env.keepAwake).toHaveBeenLastCalledWith(true)
  await user.click(screen.getByRole('button', { name: 'Пауза игры' })); expect(env.keepAwake).toHaveBeenLastCalledWith(false)
})
test('Enter на экранах подготовки: раздать роли, но День 1 не начинается тем же двойным нажатием', async () => {
  const { app, user, env } = renderApp((a) => a.newGame())
  await user.keyboard('{Enter}'); await user.keyboard('{Enter}')
  expect(app.getState().screen).toBe('deal'); expect(app.getState().game!.phase).toEqual({ kind: 'deal' })
  advance(env, 500); await user.keyboard('{Enter}'); expect(app.getState().game!.phase).toEqual({ kind: 'day', n: 1 })
})

test('после клика мышью по другой кнопке Enter жмёт главную; после Tab — кнопку в фокусе', async () => {
  const { app, user, env } = renderApp(speaking)
  await user.click(screen.getByRole('button', { name: '+10 с' }))
  // Браузер считает кнопку «в фокусе с клавиатуры», как только нажата любая клавиша: на :focus-visible полагаться нельзя.
  const focusVisible = vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
    return selector === ':focus-visible' ? true : Element.prototype.closest.call(this, selector) === this
  })
  advance(env, 500); await user.keyboard('{Enter}')
  focusVisible.mockRestore()
  expect(app.getState().game!.day!.speaking).toMatchObject({ seat: 6 })
  screen.getByRole('button', { name: 'Заново' }).focus(); advance(env, 20_000)
  await user.keyboard('{Tab}{Shift>}{Tab}{/Shift}'); await user.keyboard('{Enter}')
  expect(app.getState().game!.day!.speaking).toMatchObject({ seat: 6 }); expect(app.getState().session!.timer).toMatchObject({ status: 'ready', remainingMs: 60_000 })
})

test('после «Отменить» пробел запускает таймер того, кто говорит, а не передаёт слово дальше', async () => {
  const { app, user } = renderApp((a) => { speaking(a); a.speak('speech', 6); a.undo() })
  expect(screen.getByText('Речь №5')).toBeInTheDocument()
  await user.keyboard(' ')
  expect(app.getState().game!.day!.speaking).toMatchObject({ seat: 5 }); expect(app.getState().session!.timer).toMatchObject({ seat: 5, status: 'running' })
})

// ── Видимость ролей по фазе ─────────────────────────────────────────────────

test('«Город просыпается: День 1» скрывает роли на столе; кнопка и H открывают их до конца дня; ночью роли открыты', async () => {
  const { app, user, env } = renderApp((a) => { a.newGame(); a.dealDraft() })
  expect(screen.queryByText('роль скрыта')).not.toBeInTheDocument()
  advance(env, 500); await user.click(screen.getByRole('button', { name: /Город просыпается: День 1/ }))
  expect(app.getState().settings.rolesHidden).toBe(true)
  expect(screen.getAllByText('роль скрыта')).toHaveLength(10)
  await user.click(screen.getByRole('button', { name: 'Показать роли' }))
  expect(screen.queryByText('роль скрыта')).not.toBeInTheDocument()
  await user.keyboard('h'); expect(screen.getAllByText('роль скрыта')).toHaveLength(10)
  await user.keyboard('h'); expect(app.getState().settings.rolesHidden).toBe(false)
  // Внутри дня открытые роли остаются открытыми.
  act(() => { app.dispatch({ type: 'openCircle', first: 1 }) }); expect(app.getState().settings.rolesHidden).toBe(false)
  await user.keyboard('h'); act(() => { app.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } }) })
  expect(app.getState().settings.rolesHidden).toBe(false); expect(screen.queryByText('роль скрыта')).not.toBeInTheDocument()
})
