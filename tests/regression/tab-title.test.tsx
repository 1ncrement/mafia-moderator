import { screen } from '@testing-library/react'
import { renderApp } from '../ui/helpers'

// Спецификация 6.9: все строки интерфейса лежат в двух словарях. Заголовок вкладки — тоже строка интерфейса.
test('заголовок вкладки переключается вместе с языком', async () => {
  const { user } = renderApp()
  expect(document.title).toBe('Мафия — помощник ведущего')
  await user.click(screen.getByRole('button', { name: 'Українська' }))
  expect(document.title).toBe('Мафія — помічник ведучого')
})
