import { useEffect, useRef } from 'react'
import { phaseLabel, plural } from '../../app/i18n'
import { useLang, useStore, useT } from '../../app/StoreContext'
import type { FoulsState } from '../../engine'
import { Button } from '../common/Button'
import { Undo } from '../common/icons'
import { PRESS_GUARD_MS } from './MainButton'

/**
 * Окно «Наказание за фолы»: игрок набрал очередной третий фол. Фол уже записан — ведущий решает только, применять ли наказание:
 * один день без своей минуты в круге. Закрывается только решением; «Отменить фол» снимает сам фол — шапка с её «Отменить» под окном недоступна.
 * today — номер идущего дня, null ночью: по нему окно говорит «сегодня» или называет день.
 * onUndo — есть, только когда последним действием был сам фол: общая отмена сняла бы что-то другое.
 */
export function FoulDialog({ pending, today, onUndo }: { pending: FoulsState['pending'][number]; today: number | null; onUndo?: () => void }) {
  const store = useStore()
  const t = useT()
  const lang = useLang()
  const box = useRef<HTMLDivElement>(null)
  // Enter, которым ведущий только что нажал другую кнопку, не должен тут же применить наказание.
  const openedAt = useRef(Infinity)
  const { seat } = pending
  const decide = (apply: boolean) => store.dispatch({ type: 'decideFoulPenalty', seat, apply })
  const latest = useRef({ decide, onUndo })
  useEffect(() => {
    latest.current = { decide, onUndo }
  })

  useEffect(() => {
    openedAt.current = store.now()
    box.current?.focus()
  }, [store, seat, pending.level])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === 'Enter') {
        e.preventDefault()
        if (store.now() - openedAt.current >= PRESS_GUARD_MS) latest.current.decide(true)
      } else if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.code === 'KeyZ' || e.key.toLowerCase() === 'z') && latest.current.onUndo) {
        e.preventDefault()
        latest.current.onUndo()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [store])

  return (
    <div className="dialog-backdrop">
      <div ref={box} role="dialog" aria-modal="true" aria-label={t('foul.dialog')} tabIndex={-1} className="foul">
        <span className="foul-cap">{t('foul.dialog')}</span>
        <span className="foul-title num">{t('foul.title', { n: seat, fouls: plural(lang, pending.level, 'fouls') })}</span>
        <div className="foul-box">
          <span className="foul-main">
            {pending.day === today
              ? t('foul.text.today', { n: seat })
              : t('foul.text.later', { n: seat, phase: phaseLabel(lang, { kind: 'day', n: pending.day }) })}
          </span>
          <span className="foul-note">{t('foul.text.rights')}</span>
        </div>
        <span className="small muted">{t('foul.text.counted')}</span>
        <Button
          variant="primary" size="xl" className="foul-apply" kbd="Enter"
          onClick={() => { if (store.now() - openedAt.current >= PRESS_GUARD_MS) decide(true) }}
        >
          {t('foul.apply')}
        </Button>
        <Button size="l" variant="outline" onClick={() => decide(false)}>{t('foul.decline')}</Button>
        {onUndo && <Button variant="ghost" className="foul-undo" onClick={onUndo}><Undo />{t('foul.undo')}</Button>}
      </div>
    </div>
  )
}
