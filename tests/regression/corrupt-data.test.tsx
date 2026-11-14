import { render, screen } from '@testing-library/react'
import { createAppStore } from '../../src/app/store'
import { App } from '../../src/ui/App'
import { seeded, testEnv } from '../helpers'
import '../ui/helpers'

// Спецификация 7.5: «повреждённые данные не затираются и не роняют приложение».
// 7.2: «Проход по журналу никогда не бросает исключений».
function saved() {
  const env = testEnv()
  const app = seeded(env)
  app.dispatch({ type: 'startPhase', phase: { kind: 'day', n: 1 } })
  return { env, id: app.getState().session!.id }
}

test('активная игра с испорченным событием раздачи: запуск не падает, игра помечена нечитаемой', () => {
  const { env, id } = saved()
  const key = `mafia:session:${id}`
  const session = JSON.parse(env.kv.getItem(key)!) as { log: { type: string; assignment: unknown }[] }
  session.log.find((e) => e.type === 'roles_dealt')!.assignment = {}
  const raw = JSON.stringify(session)
  env.kv.setItem(key, raw)

  const app = createAppStore(testEnv(env.kv))
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    expect(() => render(<App store={app} />)).not.toThrow()
  } finally {
    spy.mockRestore()
  }
  expect(screen.getByRole('button', { name: /Новая игра/ })).toBeInTheDocument()
  expect(env.kv.getItem(key)).toBe(raw)
})

test('строка списка игр с нечисловой датой: главная открывается', () => {
  const { env, id } = saved()
  const index = JSON.parse(env.kv.getItem('mafia:index')!) as Record<string, unknown>[]
  env.kv.setItem('mafia:index', JSON.stringify(index.map((m) => ({ ...m, createdAt: 'вчера' }))))
  env.kv.removeItem('mafia:active')

  const app = createAppStore(testEnv(env.kv))
  expect(app.getState().sessions.map((m) => m.id)).toContain(id)
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    expect(() => render(<App store={app} />)).not.toThrow()
  } finally {
    spy.mockRestore()
  }
  expect(screen.getByRole('button', { name: /Новая игра/ })).toBeInTheDocument()
})
