import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name).replaceAll('\\', '/')
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}
const read = (file: string) => readFileSync(file, 'utf8')

test('идентификаторы ролей, сторон и опций не встречаются вне src/engine/roles', () => {
  const offenders = sourceFiles('src').filter((f) => !f.includes('src/engine/roles/'))
    .filter((f) => /['"`](civilian|mafia|godfather|prostitute|sheriff|doctor|red|black|bodyguard|journalist|butcher|maniac|bulletproof|solo_butcher|solo_maniac|leader_block|journalist_pace|maniac_no_repeat|maniac_no_nominate|maniac_no_vote)['"`]/.test(read(f)))
  expect(offenders).toEqual([])
})
