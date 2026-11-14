import { useState } from 'react'
import { cap, hasKey, plural, roleText, translateKey } from '../../app/i18n'
import { useApp, useStore, useT } from '../../app/StoreContext'
import {
  checkComposition, configurableRoles, DEFAULT_DURATIONS, defaultComposition, MAX_PLAYERS, MIN_PLAYERS, nestedRoles,
} from '../../engine'
import type { Durations, RoleDef } from '../../engine'
import { Button } from '../common/Button'
import { SideDot } from '../common/SideDot'
import { Stepper } from '../common/Stepper'
import { useHotkeys } from '../common/useHotkeys'
import './prepare.css'

export const DURATION_KEYS = ['speech', 'balagan', 'defense', 'tiebreak', 'farewell'] as const

/** Пять длительностей и переключатель «запускать таймер отдельной кнопкой». Шаг 5 секунд, границы 10–300. */
export function TimerFields({ durations, separate, onDurations, onSeparate }: {
  durations: Durations; separate: boolean; onDurations(next: Durations): void; onSeparate(next: boolean): void
}) {
  const t = useT()
  return (
    <div className="timers-edit">
      {DURATION_KEYS.map((key) => (
        <div key={key} className="timers-row">
          <span>{t(`timer.${key}`)}</span>
          <Stepper
            value={durations[key]} min={10} max={300} step={5} text={t('unit.sec', { n: durations[key] })}
            lessLabel={t('stepper.less', { name: t(`timer.${key}`) })} moreLabel={t('stepper.more', { name: t(`timer.${key}`) })}
            onChange={(n) => onDurations({ ...durations, [key]: n })}
          />
        </div>
      ))}
      <label className="timers-row">
        <span>{t('timer.separateStart')}</span>
        <button type="button" role="switch" aria-checked={separate} aria-label={t('timer.separateStart')} className="switch" onClick={() => onSeparate(!separate)}>
          <span className="switch-track"><span className="switch-knob" /></span>
        </button>
      </label>
    </div>
  )
}

export function SetupScreen() {
  const { draft, settings } = useApp()
  const store = useStore()
  const t = useT()
  const lang = settings.lang
  const registry = store.registry
  const [editTimers, setEditTimers] = useState(false)

  const check = checkComposition(draft.playerCount, draft.composition, registry)
  const filler = registry.roles.find((r) => r.filler)
  const sideName = (role: RoleDef) => translateKey(lang, registry.sides.find((s) => s.id === role.side)?.nameKey ?? role.side)
  const about = (role: RoleDef) => (hasKey(`${role.nameKey}.about`) ? translateKey(lang, `${role.nameKey}.about`) : '')
  const sub = (role: RoleDef) => [sideName(role), about(role)].filter(Boolean).join(' · ')
  const setCount = (id: string, n: number) => store.editDraft({ composition: { ...draft.composition, [id]: n } })

  // Колода, сгруппированная по названию: «мафия · глава», «мирный житель × 6».
  const deck: { text: string; n: number }[] = []
  for (const card of check.deck) {
    const text = roleText(lang, registry, card)
    const last = deck.at(-1)
    if (last && last.text === text) last.n++
    else deck.push({ text, n: 1 })
  }

  const canDeal = check.errors.length === 0
  useHotkeys({ enter: () => canDeal && store.dealDraft() }, true)

  const extra = check.deck.length - draft.playerCount
  const errorText = check.errors.includes('players_out_of_range') ? t('setup.error.players_out_of_range')
    : check.errors.includes('too_many_roles') ? t('setup.error.too_many_roles', { n: extra })
    : null
  const warnings = check.errors.length > 0 ? [] : check.warnings

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-title">
          <span className="page-name num">{t('setup.title')}</span>
          <span className="page-step">{t('setup.subtitle')}</span>
        </div>
        <Button onClick={() => store.goHome()}>{t('setup.home')}</Button>
      </header>
      <main className="split">
        <section className="split-main">
          <div className="panel setup-players">
            <div className="setup-players-text">
              <span className="setup-players-title">{t('setup.players')}</span>
              <span className="muted">{t('setup.players.hint')}</span>
            </div>
            <Stepper
              big value={draft.playerCount} min={MIN_PLAYERS} max={MAX_PLAYERS}
              lessLabel={t('setup.players.less')} moreLabel={t('setup.players.more')}
              onChange={(n) => store.editDraft({ playerCount: n })}
            />
          </div>

          <h2 className="h2">{t('setup.roles')}</h2>
          {configurableRoles(registry).map((role) => {
            const name = cap(translateKey(lang, role.nameKey))
            const count = draft.composition[role.id] ?? 0
            const nested = nestedRoles(registry, role.id).map((n) => ({ def: n, n: Math.min(n.exactCount ?? 0, count) })).filter((x) => x.n > 0)
            return (
              <div key={role.id} className="role-row">
                <button
                  type="button" role="switch" aria-checked={count > 0} aria-label={t('setup.role.on', { role: name })} className="switch"
                  onClick={() => setCount(role.id, count > 0 ? 0 : Math.max(1, role.defaultCount))}
                >
                  <span className="switch-track"><span className="switch-knob" /></span>
                </button>
                <SideDot registry={registry} side={role.side} />
                <div className="role-row-text">
                  <span className="role-row-name">{name}</span>
                  <span className="muted">{sub(role)}</span>
                  {nested.map((x) => (
                    <span key={x.def.id} className="note-pill">
                      {t('setup.nested', { role: translateKey(lang, x.def.nameKey), n: x.n })}{about(x.def) ? ` — ${about(x.def)}` : ''}
                    </span>
                  ))}
                </div>
                <Stepper
                  value={count} min={0} max={MAX_PLAYERS}
                  lessLabel={t('stepper.less', { name })} moreLabel={t('stepper.more', { name })}
                  onChange={(n) => setCount(role.id, n)}
                />
              </div>
            )
          })}
          {filler && (
            <div className="role-row">
              <span className="switch" aria-hidden="true" />
              <SideDot registry={registry} side={filler.side} />
              <div className="role-row-text">
                <span className="role-row-name">{cap(translateKey(lang, hasKey(`${filler.nameKey}.many`) ? `${filler.nameKey}.many` : filler.nameKey))}</span>
                <span className="muted">{sub(filler)}</span>
              </div>
              <span className="role-row-fixed num">{check.civilians}</span>
            </div>
          )}
        </section>

        <section className="split-side">
          <div className="panel setup-total">
            <div className="setup-total-line">
              <span className="setup-total-players">{plural(lang, draft.playerCount, 'players')}</span>
              {registry.sides.map((side) => (
                <span key={side.id} className="setup-total-side">
                  <SideDot registry={registry} side={side.id} />
                  {translateKey(lang, `${side.nameKey}.gen`)} {check.bySide[side.id] ?? 0}
                </span>
              ))}
            </div>
            <span className="small muted">{t('setup.deck')}</span>
            <div className="chips">
              {deck.map((d) => <span key={d.text} className="chip">{d.n > 1 ? `${d.text} × ${d.n}` : d.text}</span>)}
            </div>
          </div>

          <div className="panel setup-timers">
            <div className="setup-timers-head">
              <h2 className="h2">{t('setup.timers')}</h2>
              <Button variant="outline" onClick={() => setEditTimers(!editTimers)}>{editTimers ? t('setup.timers.done') : t('setup.timers.edit')}</Button>
            </div>
            {editTimers ? (
              <TimerFields
                durations={draft.durations} separate={draft.separateTimerStart}
                onDurations={(durations) => store.editDraft({ durations })} onSeparate={(separateTimerStart) => store.editDraft({ separateTimerStart })}
              />
            ) : (
              <dl className="timers-list">
                {DURATION_KEYS.map((key) => (
                  <div key={key} className="timers-item">
                    <dt className="muted">{t(`timer.${key}`)}</dt>
                    <dd>{t('unit.sec', { n: draft.durations[key] })}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {errorText && <p className="alert-line" role="alert">{errorText}</p>}
          {warnings.map((w) => <p key={w} className="alert-line">{t(`setup.warn.${w as 'no_killer' | 'black_not_less_than_red'}`)}</p>)}
          <Button variant="primary" size="xl" className="setup-deal" kbd="Enter" disabled={!canDeal} onClick={() => store.dealDraft()}>
            {t('setup.deal')}
          </Button>
          <Button
            variant="ghost" className="setup-reset"
            onClick={() => store.editDraft({ composition: defaultComposition(registry), durations: DEFAULT_DURATIONS, separateTimerStart: false })}
          >
            {t('setup.reset')}
          </Button>
        </section>
      </main>
    </div>
  )
}
