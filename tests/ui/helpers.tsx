import { act, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UserEvent } from '@testing-library/user-event'
import { createAppStore, metaOf } from '../../src/app/store'
import type { AppStore } from '../../src/app/store'
import { createStorage } from '../../src/platform/storage'
import { App } from '../../src/ui/App'
import { game, testEnv, toDay } from '../helpers'
import type { TestEnv } from '../helpers'

// Реестр «приложение → его окружение»: seedGame находит хранилище своего app.
const envs = new WeakMap<AppStore, TestEnv>()

/** Тикает только setInterval: часы приложения — env.now, а setTimeout нужен самой Testing Library. */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
})
afterEach(() => {
  vi.useRealTimers()
})

export function renderApp(prepare?: (app: AppStore) => void): { app: AppStore; user: UserEvent; env: TestEnv; unmount(): void } {
  const env = testEnv()
  const app = createAppStore(env)
  envs.set(app, env)
  prepare?.(app)
  const user = userEvent.setup()
  const view = render(<App store={app} />)
  return { app, user, env, unmount: view.unmount }
}

/** Кладёт в хранилище этого app сессию «начало Дня day» и открывает её. */
export function seedGame(app: AppStore, table: string, day: number): void {
  const env = envs.get(app)
  if (!env) throw new Error('seedGame: приложение создано не через renderApp')
  const session = toDay(game(table), day)
  createStorage(env.kv).save(session, metaOf(session))
  app.openSession(session.id)
}

/** Сдвигает часы и прокручивает тики интерфейса. */
export function advance(env: TestEnv, ms: number): void {
  act(() => {
    env.time += ms
    vi.advanceTimersByTime(ms)
  })
}
