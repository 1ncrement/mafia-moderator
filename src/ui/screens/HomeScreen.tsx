import { useState } from 'react'
import { phaseLabel, plural, translateKey } from '../../app/i18n'
import type { Lang } from '../../app/i18n'
import { useApp, useStore, useT } from '../../app/StoreContext'
import type { SessionMeta } from '../../app/store'
import { Button } from '../common/Button'
import { Dialog } from '../common/Dialog'
import { Plus } from '../common/icons'
import { SideDot } from '../common/SideDot'
import './prepare.css'

const dateText = (lang: Lang, ts: number) =>
  new Intl.DateTimeFormat(lang === 'uk' ? 'uk-UA' : 'ru-RU', { day: 'numeric', month: 'long' }).format(ts)

export function LangSwitch() {
  const { settings } = useApp()
  const store = useStore()
  const t = useT()
  return (
    <div role="group" aria-label={t('lang.group')} className="lang">
      {(['ru', 'uk'] as const).map((lang) => (
        <button key={lang} type="button" aria-pressed={settings.lang === lang} className="lang-btn" onClick={() => store.setSettings({ lang })}>
          {t(`lang.${lang}`)}
        </button>
      ))}
    </div>
  )
}

export function HomeScreen() {
  const { sessions, settings, brokenSession } = useApp()
  const store = useStore()
  const t = useT()
  const lang = settings.lang
  const [toDelete, setToDelete] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const unfinished = sessions.filter((m) => m.status !== 'finished')
  const finished = sessions.filter((m) => m.status === 'finished')
  const meta = (m: SessionMeta) =>
    t('home.meta', { players: plural(lang, m.playerCount, 'players'), alive: m.alive, date: dateText(lang, m.createdAt) })

  const copyRaw = () => {
    const raw = brokenSession ? store.rawSession(brokenSession) : null
    if (raw === null) return
    void navigator.clipboard?.writeText(raw).then(() => setCopied(true), () => setCopied(false))
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-title">
          <span className="page-name num">{t('app.title')}</span>
          <span className="page-sub muted">{t('app.subtitle')}</span>
        </div>
        <LangSwitch />
      </header>
      <main className="home">
        <button type="button" className="home-new" onClick={() => store.newGame()}>
          <Plus size={26} />
          {t('home.new')}
        </button>

        {brokenSession !== null && (
          <div className="home-broken">
            <span>{t('home.broken')}</span>
            <Button onClick={copyRaw}>{copied ? t('home.copied') : t('home.copyRaw')}</Button>
          </div>
        )}

        {unfinished.length > 0 && (
          <section aria-label={t('home.unfinished')} className="home-section">
            <h2 className="h2">{t('home.unfinished')}</h2>
            {unfinished.map((m) => (
              <div key={m.id} className="home-current">
                <div className="home-current-text">
                  <span className="home-current-phase">{phaseLabel(lang, m.phase)}</span>
                  <span className="muted">{meta(m)}</span>
                </div>
                <Button variant="strong" onClick={() => store.openSession(m.id)}>{t('home.continue')}</Button>
                <Button variant="ghost" size="l" onClick={() => setToDelete(m.id)}>{t('home.delete')}</Button>
              </div>
            ))}
          </section>
        )}

        {finished.length > 0 && (
          <section aria-label={t('home.finished')} className="home-section">
            <h2 className="h2">{t('home.finished')}</h2>
            <ul className="home-list">
              {finished.map((m) => (
                <li key={m.id} className="home-item">
                  <span className="home-item-date muted">{dateText(lang, m.updatedAt)}</span>
                  <span className="home-item-winner">
                    <SideDot registry={store.registry} side={m.winner} />
                    {m.winner === null ? t('home.noWinner') : translateKey(lang, `side.${m.winner}.win`)}
                  </span>
                  <span className="muted">{plural(lang, m.playerCount, 'players')} · {phaseLabel(lang, m.phase)}</span>
                  <Button onClick={() => store.openSession(m.id)}>{t('home.open')}</Button>
                  <Button variant="ghost" onClick={() => setToDelete(m.id)}>{t('home.delete')}</Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <span className="small muted">{t('home.stored')}</span>
      </main>

      {toDelete !== null && (
        <Dialog title={t('home.delete.title')} onClose={() => setToDelete(null)}>
          <p className="dialog-text">{t('home.delete.text')}</p>
          <div className="dialog-actions">
            <Button size="l" onClick={() => setToDelete(null)}>{t('common.cancel')}</Button>
            <Button size="l" variant="primary" onClick={() => { store.deleteSession(toDelete); setToDelete(null) }}>{t('home.delete.confirm')}</Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
