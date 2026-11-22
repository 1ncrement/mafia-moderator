import { entryText } from '../../src/app/i18n'
import { DEFAULT_REGISTRY, dealWithHistory, journal, registryFor, seatHistory } from '../../src/engine'
import type { PastDeal, RandomInt, RoleId, SeatHistory, Session } from '../../src/engine'
import { game, JOURNALIST, MANIAC, play, seededInt, TABLE_11 } from '../helpers'

// Заказчик, 2026-11-22: раздача с учётом игр текущего игрового дня. Номер, уже игравший активную роль, получает её втрое реже
// за каждую такую игру, ту же самую роль — ещё втрое реже. Шанс остаётся у всех; судим только по номерам.

const R = DEFAULT_REGISTRY
const C: RoleId = 'civilian'
const past = (...roles: RoleId[]): PastDeal => ({ roles, registry: R })
const h = (active = 0, played: Record<RoleId, number> = {}): SeatHistory => ({ active, played })
const fresh = (seats: number): SeatHistory[] => Array.from({ length: seats }, () => h())
/** 11 мест: мафия, глава мафии, проститутка, шериф, доктор и шесть мирных. */
const DECK_11: RoleId[] = ['mafia', 'godfather', 'prostitute', 'sheriff', 'doctor', C, C, C, C, C, C]
const sorted = (xs: readonly RoleId[]) => [...xs].sort()

/** Доли по номерам за runs раздач: как часто у номера выпало то, что считает hit. */
function shares(deck: RoleId[], history: SeatHistory[], hit: (role: RoleId) => boolean, runs = 20_000, seed = 7, registry = R): number[] {
  const random = seededInt(seed)
  const counts = deck.map(() => 0)
  for (let i = 0; i < runs; i++) dealWithHistory(deck, history, registry, random).forEach((role, s) => { if (hit(role)) counts[s]!++ })
  return counts.map((n) => n / runs)
}
const isActive = (role: RoleId) => role !== C && role !== 'bulletproof'
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

describe('счётчики по номерам', () => {
  test('активная игра — роль с ночным действием; мафия и глава мафии — одна роль; мирный не считается', () => {
    expect(seatHistory([past('sheriff', C, 'godfather', 'doctor', C, 'mafia', 'prostitute')], 7)).toEqual([
      h(1, { sheriff: 1 }), h(), h(1, { mafia: 1 }), h(1, { doctor: 1 }), h(), h(1, { mafia: 1 }), h(1, { prostitute: 1 }),
    ])
  })

  test('бронежилет — особая карта без ночного хода: в счёт активных игр не идёт, но запоминается как сыгранная роль', () => {
    expect(seatHistory([past('bulletproof', 'bodyguard', C)], 3)).toEqual([h(0, { bulletproof: 1 }), h(1, { bodyguard: 1 }), h()])
  })

  test('игры складываются: две игры — два счёта', () => {
    const games = [past('sheriff', 'mafia', C), past('sheriff', C, 'mafia')]
    expect(seatHistory(games, 3)).toEqual([h(2, { sheriff: 2 }), h(1, { mafia: 1 }), h(1, { mafia: 1 })])
  })

  test('другое число мест: у новых номеров истории нет, лишние номера прошлой игры отброшены', () => {
    expect(seatHistory([past('sheriff', 'mafia')], 4)).toEqual([h(1, { sheriff: 1 }), h(1, { mafia: 1 }), h(), h()])
    expect(seatHistory([past(C, 'mafia', 'sheriff', 'doctor')], 2)).toEqual([h(), h(1, { mafia: 1 })])
    expect(seatHistory([], 2)).toEqual([h(), h()])
  })

  test('своя роль считается по перечню своей игры: «просыпается ночью» — активная, «ночью спит» — нет', () => {
    const own = registryFor(R, [JOURNALIST, MANIAC])
    const history = seatHistory([{ roles: [JOURNALIST.id, MANIAC.id, C], registry: own }], 3)
    expect(history.map((seat) => seat.active)).toEqual([1, 0, 0])
    // Сыгранная роль записана у обоих; под каким ключом — дело движка (своя роль узнаётся по названию).
    expect(history.map((seat) => Object.values(seat.played))).toEqual([[1], [1], []])
  })
})

describe('раздача по весам', () => {
  test('раздаётся ровно колода — при любой истории и любом случае', () => {
    const history = [h(3, { sheriff: 3 }), h(1, { mafia: 1 }), h(), h(2, { doctor: 1, mafia: 1 }), ...fresh(7)]
    for (let seed = 1; seed <= 200; seed++) {
      expect(sorted(dealWithHistory(DECK_11, history, R, seededInt(seed)))).toEqual(sorted(DECK_11))
    }
  })

  test('истории нет — шансы равны: активная роль у каждого номера в 5 случаях из 11', () => {
    for (const share of shares(DECK_11, fresh(11), isActive)) expect(Math.abs(share - 5 / 11)).toBeLessThan(0.03)
  })

  test('пятеро уже играли активную роль: новый номер получает её чаще игравшего больше чем вдвое', () => {
    const history = [h(1, { sheriff: 1 }), h(1, { doctor: 1 }), h(1, { mafia: 1 }), h(1, { mafia: 1 }), h(1, { prostitute: 1 }), ...fresh(6)]
    const share = shares(DECK_11, history, isActive)
    const played = avg(share.slice(0, 5)), fresher = avg(share.slice(5))
    expect(fresher).toBeGreaterThan(0.55); expect(played).toBeLessThan(0.3)
    expect(fresher).toBeGreaterThan(played * 2)
    // Гарантий нет: шанс остаётся и у игравшего.
    expect(Math.min(...share)).toBeGreaterThan(0.1)
  })

  test('та же роль повторяется реже: бывшему шерифу шериф выпадает реже, чем бывшему доктору', () => {
    const history = [h(1, { sheriff: 1 }), h(1, { doctor: 1 }), ...fresh(9)]
    const sheriff = shares(DECK_11, history, (role) => role === 'sheriff')
    expect(sheriff[0]! * 2).toBeLessThan(sheriff[1]!)
    expect(sheriff[0]).toBeGreaterThan(0)
  })

  test('мафия и глава мафии — одна роль: бывшей мафии карта главы выпадает реже, чем бывшему доктору', () => {
    const history = [h(1, { mafia: 1 }), h(1, { doctor: 1 }), ...fresh(9)]
    const head = shares(DECK_11, history, (role) => role === 'godfather')
    expect(head[0]! * 2).toBeLessThan(head[1]!)
  })

  test('бронежилет реже повторяется, но шанс активной роли у бывшего бронежилета такой же, как у остальных', () => {
    const deck: RoleId[] = ['mafia', 'sheriff', 'bulletproof', C, C, C, C, C]
    const history = [h(0, { bulletproof: 1 }), ...fresh(7)]
    const active = shares(deck, history, isActive)
    // Допуск узкий: раздай особые карты раньше активных — и у бывшего жилета шанс активной роли вырастет до 0,27.
    expect(Math.abs(active[0]! - 2 / 8)).toBeLessThan(0.015)
    const vest = shares(deck, history, (role) => role === 'bulletproof')
    expect(vest[0]! * 2).toBeLessThan(vest[1]!)
  })

  test('особая карта весится только повтором: много игравший активные роли получает бронежилет не реже остальных', () => {
    const deck: RoleId[] = ['mafia', 'sheriff', 'bulletproof', C, C, C, C, C]
    const vest = shares(deck, [h(2, { sheriff: 2 }), ...fresh(7)], (role) => role === 'bulletproof')
    // Активная карта ему почти не достаётся, поэтому к раздаче жилета он чаще остаётся свободным.
    expect(vest[0]).toBeGreaterThan(avg(vest.slice(1)))
  })

  test('сила учёта — ровно втрое: одна активная игра против новичка даёт шансы 1 к 3', () => {
    const sheriff = shares(['sheriff', C], [h(1, { doctor: 1 }), h()], (role) => role === 'sheriff')
    expect(Math.abs(sheriff[0]! - 0.25)).toBeLessThan(0.02)
  })

  test('своя роль, удалённая и заведённая заново под тем же названием, — та же роль: повтор учитывается', () => {
    const before = registryFor(R, [{ id: 'custom_old', name: 'лунатик', side: 'red', night: true }])
    const now = registryFor(R, [{ id: 'custom_new', name: 'Лунатик', side: 'red', night: true }])
    const history = seatHistory([{ roles: ['custom_old', C, C], registry: before }], 3)
    const again = shares(['custom_new', C, C], history, (role) => role === 'custom_new', 20_000, 7, now)
    // Активная игра и повтор той же роли: вес 1/9 против 1 и 1 — около 5%, а не 14%, как было бы без повтора.
    expect(again[0]).toBeLessThan(0.09); expect(again[0]).toBeGreaterThan(0)
  })

  test('две карты мафии, колода без мирных и колода из одних мирных раздаются', () => {
    const noFillers: RoleId[] = ['mafia', 'mafia', 'sheriff']
    expect(sorted(dealWithHistory(noFillers, [h(1, { mafia: 1 }), h(), h()], R, seededInt(3)))).toEqual(sorted(noFillers))
    expect(dealWithHistory([C, C, C], [h(2, { sheriff: 2 }), h(), h()], R, seededInt(3))).toEqual([C, C, C])
  })

  test('истории меньше, чем мест, — недостающие номера считаются новыми', () => {
    const share = shares(DECK_11, [h(1, { sheriff: 1 })], isActive)
    expect(share[0]).toBeLessThan(share[1]!)
  })

  test('крайняя история не выводит сумму весов за диапазон генератора: 20 мест, у одного номера 30 активных игр', () => {
    const inner = seededInt(11)
    const guarded: RandomInt = (max) => {
      if (!(max <= 2 ** 32)) throw new Error(`диапазон шире генератора: ${max}`)
      return inner(max)
    }
    const deck: RoleId[] = ['mafia', 'godfather', 'prostitute', 'sheriff', 'doctor', ...Array.from({ length: 15 }, () => C)]
    const history = [h(30, { sheriff: 30 }), ...fresh(19)]
    let active = 0
    for (let i = 0; i < 2000; i++) {
      const dealt = dealWithHistory(deck, history, R, guarded)
      expect(sorted(dealt)).toEqual(sorted(deck))
      if (isActive(dealt[0]!)) active++
    }
    expect(active).toBeLessThan(20)
  })

  test('длинный вечер учёт не ломает: после 15 игр отстающий на одну игру номер сохраняет преимущество', () => {
    const history = [...Array.from({ length: 10 }, () => h(15, { mafia: 5, sheriff: 5, doctor: 5 })), h(14, { mafia: 5, sheriff: 5, doctor: 4 })]
    const share = shares(DECK_11, history, isActive)
    expect(share[10]).toBeGreaterThan(avg(share.slice(0, 10)) * 1.5)
  })
})

describe('запись раздачи', () => {
  const dealt = (s: Session) => s.log.filter((e) => e.type === 'roles_dealt')
  const dealText = (s: Session, lang: 'ru' | 'uk') => {
    const entry = journal(s, R).flatMap((g) => g.entries).find((e) => e.kind === 'deal')!
    return entryText(lang, entry, R)
  }

  test('команда раздачи записывает, сколько прошлых игр учтено; случайная раздача поля не пишет; перераздача заменяет запись', () => {
    const start = game(TABLE_11)
    const assignment = start.log.find((e) => e.type === 'roles_dealt')!.assignment
    const aware = play(start, { type: 'deal', assignment, history: 3 })
    expect(dealt(aware)).toHaveLength(1); expect(dealt(aware)[0]).toMatchObject({ history: 3 })
    const random = play(aware, { type: 'deal', assignment })
    expect(dealt(random)).toHaveLength(1); expect('history' in dealt(random)[0]!).toBe(false)
    // Ноль и не-число — это случайная раздача: поля нет.
    expect('history' in dealt(play(start, { type: 'deal', assignment, history: 0 }))[0]!).toBe(false)
  })

  test('журнал называет способ раздачи: «с учётом 3 прошлых игр», «1 прошлой игры», на украинском тоже', () => {
    const start = game(TABLE_11)
    const assignment = start.log.find((e) => e.type === 'roles_dealt')!.assignment
    expect(dealText(start, 'ru')).toMatch(/^Роли розданы: /)
    expect(dealText(play(start, { type: 'deal', assignment, history: 3 }), 'ru')).toMatch(/^Роли розданы с учётом 3 прошлых игр: /)
    expect(dealText(play(start, { type: 'deal', assignment, history: 1 }), 'ru')).toMatch(/^Роли розданы с учётом 1 прошлой игры: /)
    expect(dealText(play(start, { type: 'deal', assignment, history: 5 }), 'uk')).toMatch(/з урахуванням 5 минулих ігор: /)
    expect(dealText(play(start, { type: 'deal', assignment, history: 21 }), 'uk')).toMatch(/з урахуванням 21 минулої гри: /)
  })
})
