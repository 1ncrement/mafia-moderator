import { screen } from '@testing-library/react'
import { renderApp } from '../ui/helpers'

// Спецификация 6.8: «H — скрыть и показать роли». Экран «Распределение» показывает все роли целиком,
// кнопка «Скрыть роли» на нём есть, клавиши Enter и Esc на нём работают — а H нет.
test('клавиша H скрывает роли на экране распределения', async () => {
  const { app, user } = renderApp((a) => { a.newGame(); a.dealDraft() })
  expect(app.getState().screen).toBe('deal')
  expect(screen.getByRole('button', { name: 'Скрыть роли' })).toBeInTheDocument()
  await user.keyboard('h')
  expect(app.getState().settings.rolesHidden).toBe(true)
})
