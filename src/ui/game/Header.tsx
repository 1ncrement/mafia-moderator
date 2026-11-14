import { useEffect, useRef, useState } from 'react'
import { phaseLabel, translateKey } from '../../app/i18n'
import { useApp, useLang, useStore, useT } from '../../app/StoreContext'
import type { GameState } from '../../engine'
import { Button } from '../common/Button'
import { Eye, EyeOff, Menu, Moon, Pause, SoundOff, SoundOn, Sun, Undo } from '../common/icons'
import { SideDot } from '../common/SideDot'
import { stepLabel } from './labels'

export type GameModal = 'stop' | 'timers' | null

/** Шапка: фаза и шаг, счётчик игроков и сторон, «Отменить», «глаз», пауза, звук, меню. */
export function Header({ game, onModal }: { game: GameState; onModal(modal: GameModal): void }) {
  const { settings, storageError } = useApp()
  const store = useStore()
  const t = useT()
  const lang = useLang()
  const [menuOpen, setMenuOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null)
  const hidden = settings.rolesHidden
  const phase = game.phase ?? { kind: 'deal' as const }

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const item = (label: string, onClick: () => void) => (
    <button key={label} type="button" role="menuitem" className="menu-item" onClick={() => { setMenuOpen(false); onClick() }}>{label}</button>
  )

  return (
    <header className="game-header">
      <div className="game-header-row">
        <div className="game-phase">
          {phase.kind === 'night' ? <Moon size={26} /> : <Sun size={26} />}
          <span className="page-name num">{phaseLabel(lang, phase)}</span>
          <span className="page-step">{stepLabel(lang, store.registry, game)}</span>
        </div>
        <div className="game-counts">
          <span>{t('game.alive')} <strong>{t('game.aliveOf', { alive: game.counts.alive, total: game.counts.total })}</strong></span>
          {!hidden && store.registry.sides.map((side) => (
            <span key={side.id} className="game-count">
              <SideDot registry={store.registry} side={side.id} />
              {translateKey(lang, `${side.nameKey}.gen`)} <strong>{game.counts.bySide[side.id] ?? 0}</strong>
            </span>
          ))}
          {!hidden && game.endHint && <span className="game-hint">{t(`hint.${game.endHint}`)}</span>}
        </div>
        <div className="game-tools">
          <Button aria-label={t('game.undo')} disabled={!store.canUndo()} onClick={() => store.undo()}><Undo />{t('game.undo')}</Button>
          <Button aria-pressed={hidden} onClick={() => store.setSettings({ rolesHidden: !hidden })}>
            {hidden ? <EyeOff /> : <Eye />}{hidden ? t('roles.show') : t('roles.hide')}
          </Button>
          <Button onClick={() => store.setPaused(true)}><Pause />{t('game.pause')}</Button>
          <button
            type="button" className="icon-btn icon-btn-framed" aria-pressed={settings.sound}
            aria-label={settings.sound ? t('game.soundOn') : t('game.soundOff')} onClick={() => store.setSettings({ sound: !settings.sound })}
          >
            {settings.sound ? <SoundOn /> : <SoundOff />}
          </button>
          <div className="menu" ref={menu}>
            <button type="button" className="icon-btn icon-btn-framed" aria-label={t('game.menu')} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
              <Menu />
            </button>
            {menuOpen && (
              <div role="menu" className="menu-list">
                {item(t('menu.stop'), () => onModal('stop'))}
                {item(t('menu.timers'), () => onModal('timers'))}
                {item(t('menu.free30'), () => store.freeTimer(30))}
                {item(t('menu.free60'), () => store.freeTimer(60))}
                <span className="menu-sep" />
                {(['ru', 'uk'] as const).map((l) => item(t(`lang.${l}`), () => store.setSettings({ lang: l })))}
                <span className="menu-sep" />
                {item(t('menu.home'), () => store.goHome())}
              </div>
            )}
          </div>
        </div>
      </div>
      {storageError && <p className="game-storage" role="alert">{t('game.storageError')}</p>}
    </header>
  )
}
