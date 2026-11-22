// Звуковой сигнал через Web Audio, без звуковых файлов.

type AudioCtor = typeof AudioContext

/** Сигнал таймера: warn — осталось 10 секунд, end — время вышло. */
export type Signal = 'warn' | 'end'

type Tone = { at: number; hz: number; len: number }
/** Сигналы различимы на слух: предупреждение — два коротких низких тона потише, конец — три тона, последний выше и длиннее. */
const SIGNALS: Record<Signal, { volume: number; tones: Tone[] }> = {
  warn: { volume: 0.28, tones: [{ at: 0, hz: 660, len: 0.12 }, { at: 0.2, hz: 660, len: 0.12 }] },
  end: { volume: 0.35, tones: [{ at: 0, hz: 880, len: 0.22 }, { at: 0.3, hz: 880, len: 0.22 }, { at: 0.6, hz: 1175, len: 0.4 }] },
}

/**
 * Возвращает функцию «подать сигнал»: короткие тоны, не дольше секунды.
 * Контекст создаётся при первом жесте ведущего — браузеры не дают звучать странице, с которой не взаимодействовали.
 */
export function createBeeper(): (signal: Signal) => void {
  let ctx: AudioContext | null = null

  const ensure = (): AudioContext | null => {
    try {
      const Ctor: AudioCtor | undefined = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext
      if (!Ctor) return null
      ctx ??= new Ctor()
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
      return ctx
    } catch {
      return null
    }
  }

  // Первый клик или клавиша «открывают» звук, дальше сигнал может подать и тик таймера.
  const unlock = () => {
    if (ensure()?.state === 'running') {
      document.removeEventListener('pointerdown', unlock, true)
      document.removeEventListener('keydown', unlock, true)
    }
  }
  document.addEventListener('pointerdown', unlock, true)
  document.addEventListener('keydown', unlock, true)

  return (signal) => {
    const audio = ensure()
    if (!audio) return
    try {
      const start = audio.currentTime + 0.02
      const { volume, tones } = SIGNALS[signal]
      for (const { at, hz, len } of tones) {
        const osc = audio.createOscillator()
        const gain = audio.createGain()
        osc.type = 'sine'
        osc.frequency.value = hz
        gain.gain.setValueAtTime(0.0001, start + at)
        gain.gain.exponentialRampToValueAtTime(volume, start + at + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + at + len)
        osc.connect(gain).connect(audio.destination)
        osc.start(start + at)
        osc.stop(start + at + len + 0.05)
      }
    } catch {
      // звук — не причина ронять игру
    }
  }
}
