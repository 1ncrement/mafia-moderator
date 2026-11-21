import { DEFAULT_REGISTRY, DEFAULT_RULES, nightState, registryFor } from '../../src/engine'
import type { Command, Session } from '../../src/engine'
import { gameWith, playWith, toDayWith } from '../helpers'

// №1 шериф, №3 крёстный отец, №4 доктор, №5 охранник, №6 журналист, №7 мясник, №8 маньяк, №9 бронежилет, №10 проститутка, №12 мафия
const TABLE = ['sheriff', 'civilian', 'godfather', 'doctor', 'bodyguard', 'journalist', 'butcher', 'maniac', 'bulletproof', 'prostitute', 'civilian', 'mafia']
const R = registryFor(DEFAULT_REGISTRY, undefined, DEFAULT_RULES)
const night = (n: number): Command => ({ type: 'startPhase', phase: { kind: 'night', n } })
const start = (): Session => playWith(R, toDayWith(R, gameWith(R, TABLE), 1), night(1))
const A = (actionId: string, actor: number | null, target: number | null, extra: object = {}): Command =>
  ({ type: 'recordNightAction', actionId, actor, target, ...extra }) as Command
const out = (s: Session, n = 1) => nightState(s, R, n).outcome
const next = (s: Session, n: number, died: number[] = []) => playWith(R, s, { type: 'confirmNight', died }, night(n))
const seats = (s: Session, n = 1) => out(s, n).deaths.map((d) => d.seat)

// Заказчик: «если игрока в бронежилете убили, счётчик походов маньяка сбрасывается: чтобы его убить,
// маньяку нужно снова сходить к этому игроку два раза». Визит, в который жилет принял удар, в новые два не входит.

test('маньяк и жилет (слова заказчика): жилет снят — счётчик обнулён, нужно снова прийти ДВА раза', () => {
  let s = playWith(R, start(), A('maniac_visit', 8, 9))          // визит 1
  s = next(s, 2)
  s = playWith(R, s, A('maniac_visit', 8, 9, { force: true }))   // визит 2: нападение, жилет спас
  expect(out(s, 2).deaths).toEqual([]); expect(out(s, 2).notes.some((x) => x.seat === 9 && x.kind === 'vest')).toBe(true)
  s = next(s, 3)
  s = playWith(R, s, A('maniac_visit', 8, 9, { force: true }))   // первый визит после сброса: смерти быть не должно
  expect(out(s, 3).deaths).toEqual([])
  s = next(s, 4)
  s = playWith(R, s, A('maniac_visit', 8, 9, { force: true }))   // второй визит после сброса: смерть
  expect(seats(s, 4)).toEqual([9])
})
