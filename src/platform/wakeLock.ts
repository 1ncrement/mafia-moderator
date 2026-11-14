// Пока идёт игра, просим браузер не гасить экран. Если API нет — молча ничего не делаем.

type Sentinel = { release(): Promise<void>; addEventListener(type: 'release', fn: () => void): void }
type WakeLockApi = { request(type: 'screen'): Promise<Sentinel> }

let wanted = false
let sentinel: Sentinel | null = null
let listening = false

async function acquire(): Promise<void> {
  const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock
  if (!api || !wanted || sentinel || document.visibilityState !== 'visible') return
  try {
    const lock = await api.request('screen')
    lock.addEventListener('release', () => {
      if (sentinel === lock) sentinel = null
    })
    if (wanted) sentinel = lock
    else void lock.release().catch(() => {})
  } catch {
    // браузер отказал (например, режим энергосбережения) — игра продолжается
  }
}

export function keepAwake(active: boolean): void {
  wanted = active
  if (!listening) {
    listening = true
    // Блокировка снимается, когда вкладка уходит в фон: просим заново при возврате.
    document.addEventListener('visibilitychange', () => void acquire())
  }
  if (active) {
    void acquire()
  } else if (sentinel) {
    const lock = sentinel
    sentinel = null
    void lock.release().catch(() => {})
  }
}
