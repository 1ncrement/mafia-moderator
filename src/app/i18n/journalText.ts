import type { CheckAnswer, JournalEntry, JournalGroup, OutCause, Registry, Seat } from '../../engine'
import type { Lang } from '../../platform/storage'
import { cap, compositionText, hasKey, phaseLabel, plural, roleName, seatList, stepName, translate, translateKey } from './index'

// Запись журнала → строка. Текст строится при показе, поэтому журнал переключается вместе с языком.

const seat = (lang: Lang, n: Seat) => translate(lang, 'common.seat', { n })

/** Подпись исполнителя ночного действия: «Мафия», «Доктор №4», «Проститутка · выстрел». */
function performer(
  lang: Lang, registry: Registry,
  entry: { actionId: string; actor: Seat | null; numbered?: true; performerRole?: string },
): string {
  const def = registry.nightActions.find((a) => a.id === entry.actionId)
  if (!def) return entry.actionId
  const inherited = entry.performerRole !== undefined && !def.performers.includes(entry.performerRole)
  let label = inherited
    ? `${cap(roleName(lang, registry, entry.performerRole ?? ''))} · ${translateKey(lang, `effect.${def.effect}`)}`
    : stepName(lang, registry, def)
  if (entry.numbered && entry.actor !== null) label += ` ${seat(lang, entry.actor)}`
  return label
}

/** Ответ на проверку: « — чёрный», « — не шериф», « — заблокирован, проверка не состоялась». */
export function answerText(lang: Lang, registry: Registry, entry: { actionId: string; answer?: CheckAnswer }): string {
  const answer = entry.answer
  if (!answer) return ''
  if (answer.kind === 'side') return ` — ${translateKey(lang, `side.${answer.side}.one`)}`
  if (answer.kind === 'visit') return ` — ${translate(lang, answer.lethal ? 'journal.visit.again' : 'journal.visit.first')}`
  if (answer.kind === 'same') return ` — ${translate(lang, answer.same ? 'journal.same' : 'journal.different')}`
  if (answer.kind === 'rest') return ` — ${translate(lang, 'journal.rest')}`
  const def = registry.nightActions.find((a) => a.id === entry.actionId)
  if (answer.kind === 'blocked') return ` — ${translate(lang, def?.effect === 'find_role' ? 'journal.searchBlocked' : 'journal.checkBlocked')}`
  const role = roleName(lang, registry, def?.findRole ?? '')
  return ` — ${answer.found ? role : translate(lang, 'journal.notRole', { role })}`
}

/** Кто выбыл ночью: «никто не выбыл», «№7 застрелен», «№5 убит мясником», «выбыли №2 и №7». Причина одного — по ключу словаря. */
function diedText(lang: Lang, died: Seat[], causes: (OutCause | undefined)[]): string {
  const only = died[0]
  if (only === undefined) return translate(lang, 'journal.result.none')
  if (died.length > 1) return translate(lang, 'journal.result.many', { seats: seatList(lang, died) })
  const key = `journal.result.${causes[0] ?? ''}`
  return hasKey(key) ? translate(lang, key, { n: only }) : translate(lang, 'journal.result.out', { n: only })
}

export function entryText(lang: Lang, entry: JournalEntry, registry: Registry): string {
  const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate(lang, key, params)
  switch (entry.kind) {
    case 'deal':
      return t('journal.deal', { list: compositionText(lang, registry, entry.counts) })

    case 'night_action':
      // Действие с двумя целями: «Журналист: №1 и №2 — разные стороны».
      if (entry.target !== null && entry.target2 !== undefined && entry.target2 !== null) {
        return t('journal.pair', { who: performer(lang, registry, entry), a: seat(lang, entry.target), b: seat(lang, entry.target2) }) + answerText(lang, registry, entry)
      }
      return `${performer(lang, registry, entry)} → ${entry.target === null ? t('journal.nobody') : seat(lang, entry.target)}${answerText(lang, registry, entry)}`

    case 'night_missing':
      return t('journal.missing', { who: performer(lang, registry, entry) })

    case 'night_result': {
      // Причину называем, только когда никто не выбыл и по подсказке не должен был.
      const why = entry.died.length === 0 && entry.reason !== null ? ` (${t(`journal.reason.${entry.reason}`)})` : ''
      return t('journal.night.result', { result: diedText(lang, entry.died, entry.causes) + why })
    }

    case 'circle':
      return t(entry.random ? 'journal.circle.random' : entry.queued ? 'journal.circle.queued' : 'journal.circle', { n: entry.first })

    case 'nomination':
      return entry.by === null
        ? t('journal.nomination.manual', { i: entry.index, target: entry.target })
        : t('journal.nomination', { i: entry.index, by: entry.by, target: entry.target })

    case 'votes': {
      const list = entry.entries.map((e) => t('journal.votes.item', { n: e.candidate, count: e.count })).join(', ')
      return t(entry.ballot === 1 ? 'journal.votes' : 'journal.revotes', { list, voters: entry.voters })
    }

    case 'vote_result':
      if (entry.outcome === 'nobody' || entry.seats.length === 0) return t('journal.vote.nobody')
      if (entry.outcome === 'tie') return t('journal.vote.tie', { seats: seatList(lang, entry.seats) })
      return t(entry.seats.length > 1 ? 'journal.vote.eliminatedMany' : 'journal.vote.eliminated', { seats: seatList(lang, entry.seats) })

    case 'status':
      if (entry.status === 'alive') return t('journal.status.alive', { n: entry.seat })
      return hasKey(`journal.status.${entry.cause ?? ''}`) ? translateKey(lang, `journal.status.${entry.cause ?? ''}`, { n: entry.seat }) : t('journal.status.out', { n: entry.seat })

    case 'vest':
      // Жилет принял смерть (ночью или на голосовании) — «остаётся»; снят или возвращён ведущим — так и сказано.
      return t(!entry.used ? 'journal.vest.on' : entry.source === 'manual' ? 'journal.vest.off' : 'journal.vest.spared', { n: entry.seat })

    case 'swap':
      return t('journal.swap', { a: entry.a, b: entry.b })

    case 'foul':
      return t('journal.foul', { n: entry.seat, count: entry.count })

    case 'foul_penalty':
      return t(entry.applied ? 'journal.foul.penalty' : 'journal.foul.declined', {
        n: entry.seat, fouls: plural(lang, entry.level, 'fouls'), phase: phaseLabel(lang, { kind: 'day', n: entry.day }),
      })

    case 'finish':
      return t('journal.finish', { result: entry.winner === null ? t('journal.finish.nobody') : translateKey(lang, `side.${entry.winner}.win`).toLowerCase() })
  }
}

/** Строка-резюме свёрнутой группы: «Ночь 1: выстрел в №7, лечили №7 → никто не выбыл». */
export function summaryText(lang: Lang, group: JournalGroup, registry: Registry): string {
  const body = summaryBody(lang, group, registry)
  return body ? `${phaseLabel(lang, group.phase)}: ${body}` : phaseLabel(lang, group.phase)
}

/** Резюме без названия фазы: «выстрел в №7, лечили №7 → никто не выбыл». Пустая строка — сказать нечего. */
export function summaryBody(lang: Lang, group: JournalGroup, registry: Registry): string {
  const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate(lang, key, params)
  let body: string

  if (group.phase.kind === 'deal') {
    body = group.entries.some((e) => e.kind === 'deal') ? t('summary.deal') : ''
  } else if (group.phase.kind === 'night') {
    const did: string[] = []
    for (const e of group.entries) {
      if (e.kind !== 'night_action' || e.target === null) continue
      const effect = registry.nightActions.find((a) => a.id === e.actionId)?.effect
      // У действия может быть своя фраза («удар мясника по №5»), иначе — общая по виду эффекта.
      const key = hasKey(`action.${e.actionId}.summary`) ? `action.${e.actionId}.summary` : `effect.${effect}.summary`
      // role — название роли исполнителя: нужно записи своей роли («журналист → №9»).
      const params = {
        target: seat(lang, e.target), role: roleName(lang, registry, e.performerRole),
        target2: e.target2 === undefined || e.target2 === null ? '' : seat(lang, e.target2),
      }
      if (hasKey(key)) did.push(translate(lang, key, params) + answerText(lang, registry, e))
    }
    const result = group.entries.findLast((e) => e.kind === 'night_result')
    const outcome = result?.kind === 'night_result' ? diedText(lang, result.died, result.causes) : ''
    body = [did.join(', '), outcome].filter(Boolean).join(' → ')
  } else {
    const nominated = group.entries.flatMap((e) => (e.kind === 'nomination' ? [e] : [])).sort((a, b) => a.index - b.index)
    const result = group.entries.findLast((e) => e.kind === 'vote_result')
    const circle = group.entries.findLast((e) => e.kind === 'circle')
    const left = nominated.length > 0 ? t('summary.day.nominated', { list: nominated.map((e) => e.target).join(', ') })
      : circle?.kind === 'circle' ? t('summary.day.circle', { n: circle.first })
      : ''
    let right = ''
    // Кого из выгнанных спас жилет: в игре он остался.
    const spared = group.entries.flatMap((e) => (e.kind === 'vest' && e.source === 'vote' && e.used ? [e.seat] : []))
    const gone = result?.kind === 'vote_result' ? result.seats.filter((s) => !spared.includes(s)) : []
    if (result?.kind === 'vote_result') {
      if (result.outcome === 'tie') right = t('summary.day.tie', { seats: seatList(lang, result.seats) })
      else if (result.outcome === 'nobody' || result.seats.length === 0) right = t('summary.day.nobody')
      else if (gone.length === 0) right = t('summary.day.spared', { seats: seatList(lang, result.seats) })
      else if (gone.length > 1) right = t('summary.day.expelledMany', { seats: seatList(lang, gone) })
      else {
        const only = gone[0] as Seat
        const table = group.entries.findLast((e) => e.kind === 'votes' && e.ballot === result.ballot)
        const count = table?.kind === 'votes' ? table.entries.find((x) => x.candidate === only)?.count : undefined
        right = t('summary.day.expelled', { n: only }) + (count === undefined ? '' : ` (${plural(lang, count, 'votes')})`)
      }
    }
    body = [left, right].filter(Boolean).join(' → ')
  }
  return body
}

/** Журнал текстом для «Скопировать журнал»: от распределения к текущей фазе. */
export function journalAsText(lang: Lang, groups: JournalGroup[], registry: Registry): string {
  const blocks = [...groups].reverse().map((group) => {
    const lines = group.entries.map((entry) => {
      const marks = [entry.edited ? translate(lang, 'journal.edited') : '', entry.manual ? translate(lang, 'journal.manual') : ''].filter(Boolean)
      return `  ${entryText(lang, entry, registry)}${marks.length > 0 ? ` (${marks.join(', ')})` : ''}`
    })
    return [phaseLabel(lang, group.phase), ...lines].join('\n')
  })
  return blocks.join('\n\n')
}
