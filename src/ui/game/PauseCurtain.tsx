import { phaseLabel } from '../../app/i18n'
import { useLang, useStore, useT } from '../../app/StoreContext'
import type { GameState } from '../../engine'
import { Button } from '../common/Button'
import { stepLabel } from './labels'

/** Шторка паузы: закрывает экран без ролей и журнала. Снятие паузы таймер не запускает. */
export function PauseCurtain({ game }: { game: GameState }) {
  const store = useStore()
  const t = useT()
  const lang = useLang()
  const where = [game.phase ? phaseLabel(lang, game.phase) : '', stepLabel(lang, store.registry, game)].filter(Boolean).join(' · ')
  return (
    <main className="curtain">
      <span className="curtain-title num">{t('pause.title')}</span>
      <span className="curtain-where">{where}</span>
      <Button variant="primary" size="xl" autoFocus onClick={() => store.setPaused(false)}>{t('pause.resume')}</Button>
    </main>
  )
}
