import { useEffect, useRef } from 'react'
import { phaseLabel, seatList } from '../../app/i18n'
import { useLang, useStore, useT } from '../../app/StoreContext'
import type { Morning, Seat } from '../../engine'
import { Button } from '../common/Button'
import { Sun, Undo } from '../common/icons'
import { PRESS_GUARD_MS } from './MainButton'

/**
 * Окно «Объяви столу»: готовый текст утреннего объявления. Ролей и причин в нём нет — оно открывается днём, когда роли скрыты.
 * first — утро ещё не объявлено: окно закрывает только «Объявил» (Enter), и из него можно отменить подтверждение ночи —
 * шапка с её «Отменить» под окном недоступна. Окно, открытое снова из панели шага, закрывается и клавишей Esc.
 */
export function MorningDialog({ day, morning, seconds, first, onDone, onUndo }: {
  day: number
  morning: Morning
  /** Длительность прощания — для строки «прощается со столом». */
  seconds: number
  first: boolean
  onDone(): void
  onUndo?: () => void
}) {
  const store = useStore()
  const t = useT()
  const lang = useLang()
  const box = useRef<HTMLDivElement>(null)
  // Enter, которым подтвердили итог ночи, не должен тут же закрыть окно: первые 0,4 с «Объявил» не срабатывает.
  const openedAt = useRef(Infinity)
  const latest = useRef({ first, onDone, onUndo })
  useEffect(() => {
    latest.current = { first, onDone, onUndo }
  })

  useEffect(() => {
    openedAt.current = store.now()
    // Фокус уходит с кнопки под окном: пробел и Enter её больше не нажимают.
    box.current?.focus()
  }, [store])

  useEffect(() => {
    const ready = () => store.now() - openedAt.current >= PRESS_GUARD_MS
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const now = latest.current
      if (e.key === 'Enter') {
        e.preventDefault()
        if (ready()) now.onDone()
      } else if (e.key === 'Escape') {
        if (!now.first) now.onDone()
      } else if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.code === 'KeyZ' || e.key.toLowerCase() === 'z') && now.onUndo) {
        e.preventDefault()
        now.onUndo()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [store])

  const lines: { seat: Seat; text: string }[] = [
    ...morning.farewell.map((seat) => ({ seat, text: t('morning.farewell', { sec: t('unit.sec', { n: seconds }) }) })),
    ...morning.spared.map((seat) => ({ seat, text: t('morning.spared') })),
    ...morning.silenced.map((seat) => ({ seat, text: t('morning.silenced') })),
  ]
  const count = morning.deaths.length

  return (
    <div className="dialog-backdrop">
      <div ref={box} role="dialog" aria-modal="true" aria-label={t('morning.title')} tabIndex={-1} className="morning">
        <div className="morning-head">
          <Sun size={26} />
          <span className="morning-day num">{phaseLabel(lang, { kind: 'day', n: day })}</span>
          <span className="morning-title">{t('morning.title')}</span>
        </div>

        {count > 0 ? (
          <div className="morning-box">
            <span className="morning-cap">{t(count === 1 ? 'morning.out.one' : 'morning.out.many')}</span>{' '}
            <span className={count > 3 ? 'morning-big morning-big-long num' : 'morning-big num'}>{seatList(lang, morning.deaths)}</span>
          </div>
        ) : (
          <div className="morning-box morning-box-quiet">
            <span className="morning-big morning-big-long num">{t('morning.quiet')}</span>{' '}
            <span className="morning-cap">{t('morning.quiet.sub')}</span>
          </div>
        )}

        {lines.length > 0 && (
          <ul className="morning-lines">
            {lines.map((line) => (
              <li key={`${line.seat}:${line.text}`} className="morning-line">
                <span className="morning-seat num">{t('common.seat', { n: line.seat })}</span>
                <span>{line.text}</span>
              </li>
            ))}
          </ul>
        )}

        <Button
          variant="primary" size="xl" className="morning-done" kbd="Enter"
          onClick={() => { if (store.now() - openedAt.current >= PRESS_GUARD_MS) onDone() }}
        >
          {t('morning.done')}
        </Button>
        {onUndo && <Button variant="ghost" className="morning-undo" onClick={onUndo}><Undo />{t('game.undo')}</Button>}
      </div>
    </div>
  )
}
