import { useApp, useStore, useT } from '../../app/StoreContext'
import { Button } from '../common/Button'
import { Dialog } from '../common/Dialog'
import { TimerFields } from '../screens/SetupScreen'

/** Настройки таймеров идущей игры: меняют настройки сессии, действуют со следующего запуска таймера. */
export function TimerSettings({ onClose }: { onClose(): void }) {
  const { session } = useApp()
  const store = useStore()
  const t = useT()
  if (!session) return null
  return (
    <Dialog title={t('timers.title')} onClose={onClose}>
      <TimerFields
        durations={session.config.durations} separate={session.config.separateTimerStart}
        onDurations={(durations) => store.updateConfig({ durations })} onSeparate={(separateTimerStart) => store.updateConfig({ separateTimerStart })}
      />
      <p className="small muted">{t('timers.note')}</p>
      <div className="dialog-actions"><Button size="l" variant="primary" onClick={onClose}>{t('common.done')}</Button></div>
    </Dialog>
  )
}
