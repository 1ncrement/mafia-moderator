import { useRef, useState } from 'react'
import { cap, compositionText, hasKey, roleLabel, roleTitle, translateKey } from '../../app/i18n'
import { useApp, useStore, useT } from '../../app/StoreContext'
import { checkComposition, dealRoles } from '../../engine'
import type { PlayerView, RoleId, Seat } from '../../engine'
import { Button, cx } from '../common/Button'
import { Dialog } from '../common/Dialog'
import { Eye, EyeOff, Moon } from '../common/icons'
import { SideDot } from '../common/SideDot'
import { useHotkeys } from '../common/useHotkeys'
import { PRESS_GUARD_MS } from '../game/MainButton'
import './prepare.css'

export function DealScreen() {
  const { session, game, settings, storageError } = useApp()
  const store = useStore()
  const t = useT()
  const lang = settings.lang
  const registry = store.registry
  const [confirmRedeal, setConfirmRedeal] = useState(false)
  /** Режим обмена: null — выключен, { first: null } — ждём первый номер, { first: n } — ждём второй. */
  const [swap, setSwap] = useState<{ first: Seat | null } | null>(null)
  // Двойной Enter на «Раздать роли» не должен тут же начать День 1.
  const openedAt = useRef(store.now())
  const start = () => {
    if (store.now() - openedAt.current >= PRESS_GUARD_MS) store.startFirstDay()
  }
  // На этом экране вся раздача на виду — H прячет её так же, как на игровом экране.
  const hide = () => store.setSettings({ rolesHidden: !store.getState().settings.rolesHidden })
  useHotkeys({ enter: start, escape: () => setSwap(null), hide }, true)
  if (!session || !game) return null

  const hidden = settings.rolesHidden
  const players = game.players
  const counts: Record<RoleId, number> = {}
  for (const p of players) counts[p.roleId] = (counts[p.roleId] ?? 0) + 1

  // «Кто есть кто»: игроки сгруппированы по названию, под которым роль показана на столе.
  const groups: { key: RoleId; side: string; seats: PlayerView[] }[] = []
  for (const role of registry.roles) {
    const shownAs = role.displayAs ?? role.id
    const seats = players.filter((p) => p.roleId === role.id)
    if (seats.length === 0) continue
    const group = groups.find((g) => g.key === shownAs)
    if (group) group.seats = [...group.seats, ...seats].sort((a, b) => a.seat - b.seat)
    else groups.push({ key: shownAs, side: role.side, seats })
  }
  // Сначала активные роли, остаток (мирные) — в конце.
  groups.sort((a, b) => Number(registry.roles.find((r) => r.id === a.key)?.filler ?? false) - Number(registry.roles.find((r) => r.id === b.key)?.filler ?? false))
  const groupName = (key: RoleId) => {
    const def = registry.roles.find((r) => r.id === key)
    if (!def) return key
    return cap(hasKey(`${def.nameKey}.short`) ? translateKey(lang, `${def.nameKey}.short`) : roleTitle(lang, def))
  }
  const seatsText = (seats: PlayerView[]) => seats.map((p, i) => {
    const mark = roleLabel(lang, registry, p.roleId).mark
    return `${i === 0 ? '№' : ''}${p.seat}${mark ? ` — ${mark}` : ''}`
  }).join(', ')

  const redeal = () => {
    const check = checkComposition(session.config.playerCount, session.config.composition, registry)
    const deck = check.errors.length === 0 ? check.deck : players.map((p) => p.roleId)
    store.dispatch({ type: 'deal', assignment: dealRoles(deck, store.randomInt) })
    setConfirmRedeal(false)
  }
  const pick = (seat: Seat) => {
    if (!swap) return
    if (swap.first === null) return setSwap({ first: seat })
    store.dispatch({ type: 'swapRoles', a: swap.first, b: seat })
    setSwap(null)
  }

  return (
    <div className="page" data-phase="night">
      <header className="page-header">
        <div className="page-title deal-title">
          <Moon size={26} />
          <span className="page-name num deal-name">{t('phase.deal')}</span>
          <span className="page-step">{t('deal.subtitle')}</span>
        </div>
        <span className="deal-hint muted">{t('deal.hint')}</span>
        <Button aria-pressed={hidden} onClick={() => store.setSettings({ rolesHidden: !hidden })}>
          {hidden ? <EyeOff /> : <Eye />}
          {hidden ? t('roles.show') : t('roles.hide')}
        </Button>
      </header>
      {storageError && <p className="storage-warning" role="alert">{t('game.storageError')}</p>}
      <main className="split">
        <section className="split-main">
          <h2 className="h2">{t('deal.grid')}</h2>
          {swap && (
            <div className="deal-swap">
              <span>{swap.first === null ? t('deal.swap.first') : t('deal.swap.second', { n: swap.first })}</span>
              <Button onClick={() => setSwap(null)}>{t('common.cancel')}</Button>
            </div>
          )}
          <ul className="deal-grid" data-columns={players.length > 12 ? 5 : 4}>
            {players.map((p) => {
              const label = roleLabel(lang, registry, p.roleId)
              const strong = registry.sides.find((s) => s.id === p.side)?.ring === true
              const body = (
                <>
                  <span className="deal-card-num num">{p.seat}</span>
                  {hidden ? <span className="muted">{t('roles.hidden')}</span> : (
                    <span className="deal-card-role">
                      <span className="deal-card-name"><SideDot registry={registry} side={p.side} />{label.name}</span>
                      {(label.note ?? label.mark) && <span className="small muted">{label.note ?? label.mark}</span>}
                    </span>
                  )}
                </>
              )
              const className = cx('deal-card', strong && !hidden && 'deal-card-strong', swap?.first === p.seat && 'deal-card-picked')
              return (
                <li key={p.seat}>
                  {swap
                    ? <button type="button" className={className} aria-label={t('pick.seat', { n: p.seat })} disabled={swap.first === p.seat} onClick={() => pick(p.seat)}>{body}</button>
                    : <div className={className}>{body}</div>}
                </li>
              )
            })}
          </ul>
        </section>

        <section className="split-side">
          {!hidden && (
            <div className="panel deal-who">
              <h2 className="h2">{t('deal.who')}</h2>
              <dl className="deal-who-list">
                {groups.map((g) => (
                  <div key={g.key} className="deal-who-row">
                    <dt className="muted"><SideDot registry={registry} side={g.side} />{groupName(g.key)}</dt>
                    <dd>{seatsText(g.seats)}</dd>
                  </div>
                ))}
              </dl>
              <span className="small muted">{t('deal.check', { list: compositionText(lang, registry, counts) })}</span>
            </div>
          )}
          <div className="deal-actions">
            <Button size="l" onClick={() => setConfirmRedeal(true)}>{t('deal.redeal')}</Button>
            <Button size="l" onClick={() => setSwap(swap ? null : { first: null })}>{t('deal.swap')}</Button>
            <Button size="l" variant="outline" onClick={() => store.backToSetup()}>{t('deal.back')}</Button>
          </div>
          <div data-phase="day" className="deal-start">
            <Button variant="primary" size="xl" kbd="Enter" onClick={start}>
              {t('deal.start')}
            </Button>
          </div>
          <span className="small muted">{t('deal.note')}</span>
        </section>
      </main>

      {confirmRedeal && (
        <Dialog title={t('deal.redeal.title')} onClose={() => setConfirmRedeal(false)}>
          <p className="dialog-text">{t('deal.redeal.text')}</p>
          <div className="dialog-actions">
            <Button size="l" onClick={() => setConfirmRedeal(false)}>{t('common.cancel')}</Button>
            <Button size="l" variant="primary" onClick={redeal}>{t('deal.redeal.confirm')}</Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
