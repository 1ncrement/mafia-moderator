import { readFileSync } from 'node:fs'

// Сборка — один файл, стили глобальные. Правило экранов подготовки с тем же классом, что у игрового экрана,
// меняет и игровой экран: так кнопки-значки панели игрока и списка выставленных получили рамку от экрана состава.

/** Классы, у которых в файле есть собственное правило (селектор — один этот класс). */
function ownClasses(file: string): Set<string> {
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  return new Set([...css.matchAll(/(?:^|[{},])\s*\.([a-z][\w-]*)\s*(?=[,{])/g)].map((m) => m[1] as string))
}

test('экраны подготовки не переопределяют классы игрового экрана', () => {
  const game = ownClasses('src/ui/game/game.css')
  const prepare = ownClasses('src/ui/screens/prepare.css')
  expect(game.has('icon-btn')).toBe(true)                          // разбор находит правила
  expect([...prepare].filter((name) => game.has(name))).toEqual([])
})
