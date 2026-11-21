import { useState } from 'react'
import { cap, hasKey, phaseLabel, roleTitle, translateKey } from '../../app/i18n'
import { useApp, useLang, useStore, useT } from '../../app/StoreContext'
import type { GameState, SideId } from '../../engine'
import { Button } from '../common/Button'
import { Dialog } from '../common/Dialog'
import { SideDot } from '../common/SideDot'

/** Роли стороны одной строкой: «мирные жители, шериф, доктор». */
export function useSideRoles() {
  const store = useStore()
  const lang = useLang()
  return (side: SideId) => store.registry.roles
    .filter((r) => r.side === side && !r.displayAs)
    .sort((a, b) => Number(b.filler ?? false) - Number(a.filler ?? false))
    .map((r) => (hasKey(`${r.nameKey}.many`) ? translateKey(lang, `${r.nameKey}.many`) : roleTitle(lang, r)))
    .join(', ')
}

/**
 * Остановка игры: ведущий выбирает сторону и подтверждает. Тем же окном меняется победитель
 * уже завершённой игры (change). «Без победителя» — для брошенной партии.
 */
export function StopDialog({ game, change, onClose }: { game: GameState; change?: boolean; onClose(): void }) {
  const { settings } = useApp()
  const store = useStore()
  const t = useT()
  const lang = useLang()
  const sideRoles = useSideRoles()
  /** undefined — ещё не выбрано; null — без победителя. */
  const [winner, setWinner] = useState<SideId | null | undefined>(change ? (game.finished?.winner ?? null) : undefined)

  const result = winner === undefined ? '' : winner === null ? t('journal.finish.nobody') : translateKey(lang, `side.${winner}.win`).toLowerCase()
  const confirm = () => {
    if (winner === undefined) return
    store.dispatch({ type: 'finishGame', winner })
    onClose()
  }
  const option = (side: SideId | null, title: string, sub: string) => (
    <button key={side ?? 'none'} type="button" role="radio" aria-checked={winner === side} className="stop-option" onClick={() => setWinner(side)}>
      <SideDot registry={store.registry} side={side} hollow={side === null} />
      <span className="stop-option-text"><span className="stop-option-title">{title}</span><span className="muted">{sub}</span></span>
    </button>
  )

  return (
    <Dialog title={change ? t('stop.change.title') : t('stop.title')} onClose={onClose}>
      <p className="dialog-text">
        {t('stop.sub', { phase: game.phase ? phaseLabel(lang, game.phase) : '', alive: game.counts.alive, total: game.counts.total })}
      </p>
      <div role="radiogroup" aria-label={t('stop.group')} className="stop-options">
        {/* Одиночка предлагается победителем, только если его роль есть в игре. */}
        {store.registry.sides.filter((side) => !side.solo || game.players.some((p) => p.side === side.id)).map((side) => {
          const who = side.solo ? t('side.solo') : sideRoles(side.id)
          // Счётчик сторон скрывается вместе с ролями.
          return option(side.id, cap(translateKey(lang, side.nameKey)), settings.rolesHidden ? who : `${who} · ${t('stop.alive', { n: game.counts.bySide[side.id] ?? 0 })}`)
        })}
        {option(null, t('stop.none'), t('stop.none.sub'))}
      </div>
      <div className="dialog-actions stop-actions">
        <Button variant="strong" onClick={onClose}>{change ? t('common.cancel') : t('stop.back')}</Button>
        <Button variant="primary" size="xl" disabled={winner === undefined} onClick={confirm}>
          {winner === undefined ? t(change ? 'stop.change.empty' : 'stop.confirm.empty') : t(change ? 'stop.change.confirm' : 'stop.confirm', { result })}
        </Button>
      </div>
    </Dialog>
  )
}
