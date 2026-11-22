import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createAppStore } from '../../src/app/store'
import type { AppStore } from '../../src/app/store'
import { App } from '../../src/ui/App'
import { testEnv } from '../helpers'
import type { TestEnv } from '../helpers'
import { advance } from './helpers'

// Заказчик, 2026-11-22: две кнопки раздачи — полный рандом и раздача с учётом игр текущего игрового дня.
// Рядом видно, сколько игр учтено, и есть «Начать отсчёт заново».

/** Момент по местным часам: 22 ноября 2026. */
const at = (hour: number, minute = 0) => new Date(2026, 10, 22, hour, minute).getTime()
const COMPOSITION = { mafia: 2, prostitute: 1, sheriff: 1, doctor: 1 }

/** Игра на 11 игроков, созданная в момент time и доведённая до Ночи 1; приложение остаётся на главной. */
function playGame(app: AppStore, env: TestEnv, time: number): void {
  env.time = time
  app.newGame(); app.editDraft({ playerCount: 11, composition: COMPOSITION }); app.dealDraft()
  app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } }); app.dispatch({ type: 'startPhase', phase: { kind: 'night', n: 1 } })
  app.goHome()
}
/** Приложение с часами на time; prepare готовит игры и открывает нужный экран. */
function mount(prepare: (app: AppStore, env: TestEnv) => void, time = at(21)) {
  const env = testEnv(); env.time = time
  const app = createAppStore(env)
  prepare(app, env)
  env.time = Math.max(env.time, time)
  const user = userEvent.setup()
  render(<App store={app} />)
  return { app, env, user }
}
/** Две игры вечера (19:05 и 20:10), затем экран состава. */
const evening = (app: AppStore, env: TestEnv) => { playGame(app, env, at(19, 5)); playGame(app, env, at(20, 10)); app.newGame() }
const dealt = (app: AppStore) => app.getState().session!.log.find((e) => e.type === 'roles_dealt')!
const randomButton = () => screen.getByRole('button', { name: /^Раздать случайно/ })
const historyButton = () => screen.getByRole('button', { name: 'Раздать с учётом прошлых игр' })

describe('экран состава', () => {
  test('прошлых игр нет: раздача с учётом игр недоступна, причина названа; случайная работает как раньше', async () => {
    const { app, user } = mount((a) => a.newGame())
    expect(historyButton()).toBeDisabled()
    expect(screen.getByText('Сегодня ещё не было игр, дошедших до ночи')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Начать отсчёт заново' })).not.toBeInTheDocument()
    await user.click(randomButton())
    expect(app.getState().screen).toBe('deal'); expect('history' in dealt(app)).toBe(false)
    expect(screen.getByText('Роздано случайно')).toBeInTheDocument()
  })

  test('были игры: счётчик называет их время, кнопка раздаёт с учётом игр, и это видно на экране раздачи', async () => {
    const { app, user } = mount(evening)
    expect(screen.getByText('Учтено игр: 2 (19:05, 20:10)')).toBeInTheDocument()
    await user.click(historyButton())
    expect(app.getState().screen).toBe('deal'); expect(dealt(app)).toMatchObject({ history: 2 })
    expect(screen.getByText('Роздано с учётом 2 прошлых игр')).toBeInTheDocument()
  })

  test('Enter раздаёт случайно, даже когда есть что учитывать', async () => {
    const { app, user } = mount(evening)
    await user.keyboard('{Enter}')
    expect(app.getState().screen).toBe('deal'); expect('history' in dealt(app)).toBe(false)
  })

  test('«Начать отсчёт заново» отсекает прежние игры без окна подтверждения; «Вернуть» возвращает их', async () => {
    const { app, user, env } = mount(evening)
    env.time = at(21, 5)
    await user.click(screen.getByRole('button', { name: 'Начать отсчёт заново' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Отсчёт начат заново в 21:05')).toBeInTheDocument()
    expect(screen.queryByText(/Учтено игр/)).not.toBeInTheDocument()
    expect(historyButton()).toBeDisabled()
    expect(app.getState().settings.dealHistoryFrom).toBe(at(21, 5))
    advance(env, 500)   // кнопки сброса и возврата ждут 0,4 с друг после друга
    await user.click(screen.getByRole('button', { name: 'Вернуть' }))
    expect(screen.getByText('Учтено игр: 2 (19:05, 20:10)')).toBeInTheDocument()
    expect(screen.queryByText(/Отсчёт начат заново/)).not.toBeInTheDocument()
    expect(historyButton()).toBeEnabled()
  })

  test('двойной клик по «Начать отсчёт заново» не попадает вторым кликом в «Вернуть»: кнопки ждут 0,4 с', async () => {
    const { app, user, env } = mount(evening)
    env.time = at(21, 5)
    await user.click(screen.getByRole('button', { name: 'Начать отсчёт заново' }))
    await user.click(screen.getByRole('button', { name: 'Вернуть' }))
    expect(app.getState().settings.dealHistoryFrom).toBe(at(21, 5))
    advance(env, 500)
    await user.click(screen.getByRole('button', { name: 'Вернуть' }))
    expect(app.getState().settings.dealHistoryFrom).toBeNull()
  })

  test('с клавиатуры: Enter на «Начать отсчёт заново» и второй Enter подряд роли не раздают', async () => {
    const { app, user, env } = mount(evening)
    for (let i = 0; i < 80 && document.activeElement !== screen.getByRole('button', { name: 'Начать отсчёт заново' }); i++) await user.tab()
    await user.keyboard('{Enter}')
    expect(app.getState().settings.dealHistoryFrom).not.toBeNull()
    await user.keyboard('{Enter}')
    expect(app.getState().screen).toBe('setup')
    advance(env, 500); await user.keyboard('{Enter}')
    expect(app.getState().screen).toBe('deal')
  })

  test('в шесть утра игровой день кончается: счётчик и кнопка обновляются сами, экран переоткрывать не надо', () => {
    const { env } = mount(evening)
    expect(historyButton()).toBeEnabled()
    advance(env, at(6, 1) + 24 * 3_600_000 - env.time)
    expect(screen.queryByText(/Учтено игр/)).not.toBeInTheDocument()
    expect(screen.getByText('Сегодня ещё не было игр, дошедших до ночи')).toBeInTheDocument()
    expect(historyButton()).toBeDisabled()
  })

  test('число мест отличается от последней учтённой игры — предупреждение, что номера могли сместиться', async () => {
    const { user } = mount(evening)
    expect(screen.queryByText(/Число мест изменилось/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Больше игроков' }))
    expect(screen.getByText('Число мест изменилось: номера могли сместиться')).toBeInTheDocument()
    expect(historyButton()).toBeEnabled()
  })

  test('состав с ошибкой — обе кнопки раздачи недоступны', () => {
    mount((a, env) => { evening(a, env); a.editDraft({ playerCount: 4 }) })
    expect(randomButton()).toBeDisabled(); expect(historyButton()).toBeDisabled()
  })

  test('подписи на украинском', () => {
    mount((a, env) => { playGame(a, env, at(19, 5)); a.setSettings({ lang: 'uk' }); a.newGame() })
    expect(screen.getByRole('button', { name: /^Роздати випадково/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Роздати з урахуванням минулих ігор' })).toBeEnabled()
    expect(screen.getByText('Враховано ігор: 1 (19:05)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Почати відлік заново' })).toBeInTheDocument()
  })
})

describe('экран раздачи', () => {
  const dialog = () => screen.getByRole('dialog', { name: 'Перераздать роли?' })

  test('«Перераздать» предлагает оба способа; без прошлых игр раздача с учётом игр недоступна', async () => {
    const { app, user, env } = mount((a) => { a.newGame(); a.dealDraft() })
    const first = dealt(app).id
    await user.click(screen.getByRole('button', { name: 'Перераздать' }))
    expect(within(dialog()).getByRole('button', { name: 'Перераздать с учётом прошлых игр' })).toBeDisabled()
    expect(within(dialog()).getByText('Сегодня ещё не было игр, дошедших до ночи')).toBeInTheDocument()
    // У Enter в окне действия нет: способ выбирается кликом. Защита 0,4 с уже прошла — День 1 не начинает именно окно.
    advance(env, 500); await user.keyboard('{Enter}')
    expect(dealt(app).id).toBe(first); expect(app.getState().game!.phase).toEqual({ kind: 'deal' })
    await user.click(within(dialog()).getByRole('button', { name: 'Перераздать случайно' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(dealt(app).id).not.toBe(first); expect('history' in dealt(app)).toBe(false)
  })

  test('перераздача с учётом игр: запись и строка «Роздано с учётом 1 прошлой игры»; случайная — «Роздано случайно»', async () => {
    const { app, user } = mount((a, env) => { playGame(a, env, at(19, 5)); a.newGame(); a.dealDraft() })
    expect(screen.getByText('Роздано случайно')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Перераздать' }))
    expect(within(dialog()).getByText('Учтено игр: 1')).toBeInTheDocument()
    await user.click(within(dialog()).getByRole('button', { name: 'Перераздать с учётом прошлых игр' }))
    expect(dealt(app)).toMatchObject({ history: 1 })
    expect(screen.getByText('Роздано с учётом 1 прошлой игры')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Перераздать' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Перераздать случайно' }))
    expect(screen.getByText('Роздано случайно')).toBeInTheDocument()
  })

  test('после перераздачи Enter начинает День 1 не раньше чем через 0,4 с: расклад надо успеть увидеть', async () => {
    const { app, user, env } = mount((a) => { a.newGame(); a.dealDraft() })
    advance(env, 500)
    await user.click(screen.getByRole('button', { name: 'Перераздать' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Перераздать случайно' }))
    await user.keyboard('{Enter}')
    expect(app.getState().game!.phase).toEqual({ kind: 'deal' })
    advance(env, 500); await user.keyboard('{Enter}')
    expect(app.getState().game!.phase).toEqual({ kind: 'day', n: 1 })
  })

  test('окно закрыто без перераздачи — Enter тоже ждёт 0,4 с: «Отмена» и второй Enter подряд День 1 не начинают', async () => {
    const { app, user, env } = mount((a) => { a.newGame(); a.dealDraft() })
    advance(env, 500)
    await user.click(screen.getByRole('button', { name: 'Перераздать' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Отмена' }))
    await user.keyboard('{Enter}')
    expect(app.getState().game!.phase).toEqual({ kind: 'deal' })
    advance(env, 500); await user.keyboard('{Enter}')
    expect(app.getState().game!.phase).toEqual({ kind: 'day', n: 1 })
  })

  test('после «Начать отсчёт заново» окно перераздачи называет причину верно: отсчёт начат заново, а не «игр не было»', async () => {
    const { user } = mount((a, env) => { playGame(a, env, at(19, 5)); env.time = at(21, 5); a.resetDealHistory(); a.newGame(); a.dealDraft() }, at(21, 10))
    await user.click(screen.getByRole('button', { name: 'Перераздать' }))
    expect(within(dialog()).getByText('Отсчёт начат заново в 21:05')).toBeInTheDocument()
    expect(within(dialog()).queryByText(/ещё не было игр/)).not.toBeInTheDocument()
    expect(within(dialog()).getByRole('button', { name: 'Перераздать с учётом прошлых игр' })).toBeDisabled()
  })

  test('роли скрыты — способ раздачи тоже не показан: столу приложение его не называет', async () => {
    const { user } = mount((a, env) => { playGame(a, env, at(19, 5)); a.newGame(); a.dealDraft('history') })
    expect(screen.getByText('Роздано с учётом 1 прошлой игры')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Скрыть роли' }))
    expect(screen.queryByText(/^Роздано/)).not.toBeInTheDocument()
  })

  test('испорченная запись о способе раздачи читается как случайная раздача — так же, как в журнале', () => {
    const env = testEnv(); env.time = at(21)
    const first = createAppStore(env)
    first.newGame(); first.dealDraft()
    const key = `mafia:session:${first.getState().session!.id}`
    for (const junk of [0, -2, null, '3', {}]) {
      const stored = JSON.parse(env.kv.getItem(key)!)
      stored.log.find((e: { type: string }) => e.type === 'roles_dealt').history = junk
      env.kv.setItem(key, JSON.stringify(stored))
      const view = render(<App store={createAppStore(env)} />)
      expect(screen.getByText('Роздано случайно')).toBeInTheDocument()
      view.unmount()
    }
  })

  test('окно перераздачи на украинском', async () => {
    const { user } = mount((a, env) => { playGame(a, env, at(19, 5)); a.setSettings({ lang: 'uk' }); a.newGame(); a.dealDraft('history') })
    expect(screen.getByText('Роздано з урахуванням 1 минулої гри')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Перероздати' }))
    const box = screen.getByRole('dialog', { name: 'Перероздати ролі?' })
    expect(within(box).getByRole('button', { name: 'Перероздати випадково' })).toBeInTheDocument()
    expect(within(box).getByRole('button', { name: 'Перероздати з урахуванням минулих ігор' })).toBeEnabled()
    expect(within(box).getByText('Враховано ігор: 1')).toBeInTheDocument()
  })
})
