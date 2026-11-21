import { screen } from '@testing-library/react'
import type { AppStore } from '../../src/app/store'
import { TABLE_11 } from '../helpers'
import { renderApp, seedGame } from '../ui/helpers'

// Спецификация 5.2 про обмен ролями: «Статусы игроков при этом сами не меняются: подсказки прошлых ночей
// пересчитываются, расхождения показываются предложением из 6.6». 6.2: «Журнал можно свернуть».
// Предложение живёт только внутри развёрнутого журнала: при свёрнутом журнале обмен ролями меняет
// подсказку прошлой ночи, а ведущий об этом не узнаёт.

const N1 = { kind: 'night', n: 1 } as const

const seed = (a: AppStore) => {
  // Ночь 1: мафия стреляет в №7, проститутка блокирует №3 (крёстный отец) — выстрела нет, никто не выбыл.
  seedGame(a, TABLE_11, 1)
  a.dispatch({ type: 'startPhase', phase: N1 })
  a.dispatch({ type: 'recordNightAction', actionId: 'mafia_shot', actor: null, target: 7 })
  a.dispatch({ type: 'recordNightAction', actionId: 'prostitute_block', actor: 10, target: 3 })
  a.dispatch({ type: 'confirmNight', died: [] })
  // Утром роли скрыты (видимость по фазе), а предложение — часть журнала: ведущий открывает роли кнопкой.
  a.setSettings({ rolesHidden: false })
}

/** Днём ведущий меняет роли №3 и №8: глава мафии на самом деле №8, значит блок №3 выстрел не отменял. */
async function swap3and8(user: ReturnType<typeof renderApp>['user']) {
  await user.click(screen.getByRole('button', { name: 'Игрок №3' }))
  await user.click(screen.getByRole('button', { name: 'Поменять роль с…' }))
  await user.click(screen.getByRole('button', { name: 'Выбрать игрока №8' }))
}

test('при свёрнутом журнале обмен ролями тоже показывает предложение исправить итог ночи', async () => {
  const { app, user } = renderApp(seed)
  await user.click(screen.getByRole('button', { name: 'Свернуть' }))
  await swap3and8(user)
  // Подсказка Ночи 1 пересчиталась: №7 должен был выбыть, статусы не тронуты.
  expect(app.getState().game!.warnings).toEqual([{ code: 'night_outcome_changed', night: 1, expected: [7] }])
  expect(app.getState().game!.players[6]!.status).toBe('alive')
  // Расхождение должно быть показано предложением — ведущий его должен увидеть.
  expect(screen.getByText(/Итог Ночи 1 теперь другой/)).toBeInTheDocument()
})
