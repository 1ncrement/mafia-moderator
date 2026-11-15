import type { ReactNode } from 'react'

// Значки нарисованы линиями, наследуют цвет текста и не тянут ничего из сети.
const Icon = ({ size = 20, children, width = 2 }: { size?: number; children: ReactNode; width?: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

export const Plus = ({ size }: { size?: number }) => <Icon size={size} width={2.5}><path d="M12 5v14" /><path d="M5 12h14" /></Icon>
export const Minus = ({ size }: { size?: number }) => <Icon size={size} width={2.5}><path d="M5 12h14" /></Icon>
export const Eye = () => <Icon><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Icon>
export const EyeOff = () => <Icon><path d="M3 3l18 18" /><path d="M10.6 5.1A10.9 10.9 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4M6.5 6.6C3.7 8.5 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.300-1" /><path d="M9.9 9.9a3 3 0 004.2 4.2" /></Icon>
export const Sun = ({ size }: { size?: number }) => <Icon size={size}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.900l1.400 1.400M17.700 17.700l1.400 1.400M4.900 19.100l1.400-1.400M17.700 6.300l1.400-1.400" /></Icon>
export const Moon = ({ size }: { size?: number }) => <Icon size={size}><path d="M20 14.500A8 8 0 019.500 4a8 8 0 1010.500 10.500z" /></Icon>
export const Undo = () => <Icon><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></Icon>
export const Pause = () => <Icon><path d="M9 5v14M15 5v14" /></Icon>
export const SoundOn = () => <Icon><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16.500 8.500a5 5 0 010 7M19 6a8.500 8.500 0 010 12" /></Icon>
export const SoundOff = () => <Icon><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M17 9.500l5 5M22 9.500l-5 5" /></Icon>
export const Menu = () => <Icon><path d="M4 6h16M4 12h16M4 18h16" /></Icon>
export const Dots = () => <Icon><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Icon>
export const Close = () => <Icon><path d="M6 6l12 12M18 6L6 18" /></Icon>
export const Pencil = () => <Icon size={18}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Icon>
export const Trash = () => <Icon size={18}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></Icon>
export const Up = () => <Icon size={16}><path d="M6 15l6-6 6 6" /></Icon>
export const Down = () => <Icon size={16}><path d="M6 9l6 6 6-6" /></Icon>
