import { useApp, useStore, useT } from '../../app/StoreContext'
import { newTimer, timerView } from '../../engine'
import type { GameState, TimerState } from '../../engine'
import { Button, cx } from '../common/Button'
import { Close } from '../common/icons'
import { expectedSpeech, liveTimer, toggleTimer } from './dayFlow'
import { useNow } from './useNow'

const clock = (ms: number, round: 'up' | 'down') => {
  const total = round === 'up' ? Math.ceil(ms / 1000) : Math.floor(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Один таймер на экране, привязанный к шагу и подписанный. По нулю — сигнал и перерасход,
 * говорящий и шаг не меняются. flash — мигание около трёх секунд после нуля.
 */
export function TimerPanel({ game, flash }: { game: GameState; flash?: boolean }) {
  const { session } = useApp()
  const store = useStore()
  const t = useT()
  const now = useNow()
  if (!session) return null

  const live = liveTimer(session, game)
  const next = expectedSpeech(game)
  // Нет идущей речи — показываем таймер следующей в состоянии «готов».
  const timer: TimerState | null = live ?? (next ? newTimer(next.kind, next.seat, session.config.durations[next.kind] * 1000) : null)
  if (!timer) return null

  const view = timerView(timer, now)
  const label = timer.seat === null ? t(`timer.label.${timer.kind}` as 'timer.label.balagan') : t(`timer.label.${timer.kind}` as 'timer.label.speech', { n: timer.seat })
  const state = view.expired ? t('timer.state.expired') : t(`timer.state.${timer.status}`)
  const share = timer.durationMs > 0 ? Math.max(0, Math.min(1, view.remainingMs / timer.durationMs)) : 0

  return (
    <div className={cx('timer', view.lastTen && 'timer-last', view.expired && 'timer-expired', flash && 'timer-flash')}>
      <div className="timer-head">
        <span className="timer-label">{label}</span>
        <span className="timer-state">{t('timer.of', { state, time: clock(timer.durationMs, 'up') })}</span>
        {live?.kind === 'free' && <button type="button" className="icon-btn" aria-label={t('timer.close')} onClick={() => store.clearTimer()}><Close /></button>}
      </div>
      <div className="timer-digits num" role="timer" aria-live="off">
        <span>{clock(view.remainingMs, 'up')}</span>
        {view.overrunMs >= 1000 && <span className="timer-over">+{clock(view.overrunMs, 'down')}</span>}
      </div>
      <div className="timer-bar"><div style={{ width: view.expired ? '100%' : `${share * 100}%` }} /></div>
      <div className="timer-buttons">
        <Button size="l" className="timer-toggle" kbd={t('timer.kbd')} onClick={() => toggleTimer(store, session, game)}>
          {!live || live.status === 'ready' ? t('timer.start') : live.status === 'running' ? t('timer.pause') : t('timer.resume')}
        </Button>
        <Button size="l" disabled={!live} onClick={() => store.timer({ type: 'add', ms: 10_000 })}>{t('timer.add10')}</Button>
        <Button size="l" disabled={!live} onClick={() => store.timer({ type: 'reset' })}>{t('timer.reset')}</Button>
      </div>
    </div>
  )
}
