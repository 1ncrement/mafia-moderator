// Звуковой сигнал через Web Audio, без звуковых файлов.

type AudioCtor = typeof AudioContext

/**
 * Возвращает функцию «подать сигнал»: три коротких тона, около секунды.
 * Контекст создаётся при первом жесте ведущего — браузеры не дают звучать странице, с которой не взаимодействовали.
 */
export function createBeeper(): () => void {
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

  return () => {
    const audio = ensure()
    if (!audio) return
    try {
      const start = audio.currentTime + 0.02
      const tones: [number, number][] = [[0, 880], [0.3, 880], [0.6, 1175]]
      for (const [offset, frequency] of tones) {
        const osc = audio.createOscillator()
        const gain = audio.createGain()
        osc.type = 'sine'
        osc.frequency.value = frequency
        gain.gain.setValueAtTime(0.0001, start + offset)
        gain.gain.exponentialRampToValueAtTime(0.35, start + offset + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + (offset === 0.6 ? 0.4 : 0.22))
        osc.connect(gain).connect(audio.destination)
        osc.start(start + offset)
        osc.stop(start + offset + 0.45)
      }
    } catch {
      // звук — не причина ронять игру
    }
  }
}
