import { Minus, Plus } from './icons'
import './common.css'

type Props = {
  value: number
  onChange(next: number): void
  min: number
  max: number
  step?: number
  lessLabel: string
  moreLabel: string
  /** Крупный счётчик игроков. */
  big?: boolean
  /** Что показать вместо числа, например «60 с». */
  text?: string
}

/** Счётчик «− число +». */
export function Stepper({ value, onChange, min, max, step = 1, lessLabel, moreLabel, big, text }: Props) {
  return (
    <div className={big ? 'stepper stepper-big' : 'stepper'}>
      <button type="button" className="stepper-btn" aria-label={lessLabel} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        <Minus />
      </button>
      <span className="stepper-value num">{text ?? value}</span>
      <button type="button" className="stepper-btn" aria-label={moreLabel} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
        <Plus />
      </button>
    </div>
  )
}
