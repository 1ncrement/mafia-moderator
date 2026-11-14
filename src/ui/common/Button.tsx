import type { ButtonHTMLAttributes } from 'react'
import './common.css'

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary — главная кнопка шага; strong — заметная вторичная; ghost — без рамки. */
  variant?: 'primary' | 'secondary' | 'strong' | 'outline' | 'ghost'
  size?: 'm' | 'l' | 'xl'
  /** Подсказка клавиши на кнопке, в имя кнопки не входит. */
  kbd?: string
}

export function Button({ variant = 'secondary', size = 'm', kbd, className, children, ...rest }: Props) {
  return (
    <button type="button" className={cx('btn', `btn-${variant}`, `btn-${size}`, className)} {...rest}>
      {children}
      {kbd && <span className="kbd" aria-hidden="true">{kbd}</span>}
    </button>
  )
}
