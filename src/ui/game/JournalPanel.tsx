import { useMemo, useState } from 'react'
import { cap, entryText, phaseLabel, summaryBody } from '../../app/i18n'
import { useApp, useLang, useStore, useT } from '../../app/StoreContext'
import { journal, phaseOrder } from '../../engine'
import type { JournalEntry, JournalGroup, PhaseRef, Session } from '../../engine'
import { cx } from '../common/Button'
import { Down, Up } from '../common/icons'

type Props = {
  session: Session
  /** Клик по записи — открыть её редактор. Без обработчика записи только читаются. */
  onEntry?(entry: JournalEntry, phase: PhaseRef): void
  /** Что показать внизу раскрытой группы (например, «Добавить запись…»). */
  footer?(group: JournalGroup): React.ReactNode
  /** Все группы раскрыты и не сворачиваются — для итогового экрана. */
  expandAll?: boolean
}

export function JournalGroups({ session, onEntry, footer, expandAll }: Props) {
  const store = useStore()
  const t = useT()
  const lang = useLang()
  const groups = useMemo(() => journal(session, store.registry), [session, store.registry])
  /** Раскрытость, выбранная ведущим; по умолчанию раскрыта только текущая фаза. */
  const [open, setOpen] = useState<Record<number, boolean>>({})

  return (
    <div className="journal-groups">
      {groups.map((group) => {
        const key = phaseOrder(group.phase)
        const expanded = expandAll || (open[key] ?? group.current)
        const body = summaryBody(lang, group, store.registry)
        return (
          <div key={key} className={cx('journal-group', expanded && 'journal-group-open', group.phase.kind !== 'day' && 'journal-group-night')}>
            <button type="button" className="journal-group-head" aria-expanded={expanded} disabled={expandAll} onClick={() => setOpen({ ...open, [key]: !expanded })}>
              {!expandAll && (expanded ? <Up /> : <Down />)}
              <span className="journal-group-text">
                <span className="journal-group-title">{phaseLabel(lang, group.phase)}</span>
                {!expanded && body && <span className="journal-group-summary">{cap(body)}</span>}
              </span>
              {group.current && !expandAll && <span className="journal-group-now">{t('journal.current')}</span>}
            </button>
            {expanded && (
              <ul className="journal-entries">
                {group.entries.length === 0 && <li className="journal-entry journal-entry-empty">{t('journal.empty')}</li>}
                {group.entries.map((entry, i) => {
                  const content = (
                    <>
                      <span>{entryText(lang, entry, store.registry)}</span>
                      {entry.edited && <span className="journal-tag">{t('journal.edited')}</span>}
                      {entry.manual && <span className="journal-tag">{t('journal.manual')}</span>}
                    </>
                  )
                  return (
                    <li key={entry.eventId ?? `${entry.kind}-${i}`}>
                      {onEntry
                        ? <button type="button" className={cx('journal-entry', entry.kind === 'night_missing' && 'journal-entry-missing')} onClick={() => onEntry(entry, group.phase)}>{content}</button>
                        : <div className={cx('journal-entry', entry.kind === 'night_missing' && 'journal-entry-missing')}>{content}</div>}
                    </li>
                  )
                })}
                {footer?.(group)}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Журнал справа: группы по фазам, текущая раскрыта, прошлые свёрнуты в строку-резюме. Скрывается вместе с ролями. */
export function JournalPanel({ collapsed, onCollapse, ...rest }: Props & { collapsed: boolean; onCollapse(next: boolean): void; children?: React.ReactNode }) {
  const { settings } = useApp()
  const t = useT()
  if (collapsed) {
    return (
      <aside className="journal journal-collapsed" aria-label={t('journal.title')}>
        <button type="button" className="journal-toggle" aria-label={t('journal.expand')} onClick={() => onCollapse(false)}>
          <span className="h2">{t('journal.title')}</span>
        </button>
      </aside>
    )
  }
  return (
    <aside className="journal" aria-label={t('journal.title')}>
      <div className="journal-head">
        <h2 className="h2">{t('journal.title')}</h2>
        <button type="button" className="btn btn-outline" onClick={() => onCollapse(true)}>{t('journal.collapse')}</button>
      </div>
      {settings.rolesHidden
        ? <p className="journal-hidden">{t('journal.hidden')}</p>
        : <>{rest.children}<JournalGroups {...rest} /></>}
    </aside>
  )
}
