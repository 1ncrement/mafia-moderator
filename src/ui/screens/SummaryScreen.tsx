import { useState } from 'react'
import { journalAsText, phaseLabel, plural, roleText, translateKey } from '../../app/i18n'
import { useApp, useLang, useStore, useT } from '../../app/StoreContext'
import { journal } from '../../engine'
import { Button, cx } from '../common/Button'
import { SideDot } from '../common/SideDot'
import { JournalGroups } from '../game/JournalPanel'
import { statusText } from '../game/labels'
import { StopDialog, useSideRoles } from '../game/StopDialog'
import '../game/game.css'
import './prepare.css'

/** Итоги: победитель, таблица «номер — роль — чем закончил», журнал целиком. Только для просмотра. */
export function SummaryScreen() {
  const { session, game } = useApp()
  const store = useStore()
  const t = useT()
  const lang = useLang()
  const sideRoles = useSideRoles()
  const [changing, setChanging] = useState(false)
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null)
  if (!session || !game) return null
  const winner = game.finished?.winner ?? null
  const registry = store.registry

  const copy = () => {
    const text = journalAsText(lang, journal(session, registry), registry)
    const done = navigator.clipboard?.writeText(text)
    if (!done) return setCopied('failed')
    done.then(() => setCopied('yes'), () => setCopied('failed'))
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="summary-head">
          <span className="page-name num summary-winner">{winner === null ? t('stop.none') : translateKey(lang, `side.${winner}.win`)}</span>
          {winner !== null && <span className="summary-side muted"><SideDot registry={registry} side={winner} />{sideRoles(winner)}</span>}
          <span className="muted">
            {t('summary.stopped', { phase: game.phase ? phaseLabel(lang, game.phase) : '', players: plural(lang, game.counts.total, 'players') })}
          </span>
        </div>
        <Button onClick={() => store.goHome()}>{t('menu.home')}</Button>
      </header>
      <main className="split">
        <section className="split-main panel summary-players" aria-label={t('summary.players')}>
          <h2 className="h2">{t('summary.players')}</h2>
          <table className="summary-table">
            <thead>
              <tr><th scope="col">{t('summary.col.seat')}</th><th scope="col">{t('summary.col.role')}</th><th scope="col">{t('summary.col.fate')}</th></tr>
            </thead>
            <tbody>
              {game.players.map((p) => (
                <tr key={p.seat} className={cx(p.status === 'out' && 'summary-out')}>
                  <td className="summary-num num">{p.seat}</td>
                  <td><span className="card-role"><SideDot registry={registry} side={p.side} />{roleText(lang, registry, p.roleId)}</span></td>
                  <td>{statusText(lang, p) ?? t('status.alive')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <div className="split-side summary-side-col">
          <section className="panel summary-actions">
            <Button variant="primary" size="xl" onClick={() => store.rematch()}>{t('summary.rematch')}</Button>
            <div className="deal-actions">
              <Button size="l" onClick={() => store.newGame()}>{t('summary.new')}</Button>
              <Button size="l" onClick={copy}>{t('summary.copy')}</Button>
              <Button size="l" variant="outline" onClick={() => store.dispatch({ type: 'resumeGame' })}>{t('summary.resume')}</Button>
              <Button size="l" variant="outline" onClick={() => setChanging(true)}>{t('summary.change')}</Button>
            </div>
            {copied && <span className="small muted" role="status">{t(copied === 'yes' ? 'summary.copied' : 'summary.copyFailed')}</span>}
          </section>
          <section className="panel summary-journal" aria-label={t('journal.title')}>
            <h2 className="h2">{t('journal.title')}</h2>
            <JournalGroups session={session} expandAll />
          </section>
        </div>
      </main>
      {changing && <StopDialog game={game} change onClose={() => setChanging(false)} />}
    </div>
  )
}
