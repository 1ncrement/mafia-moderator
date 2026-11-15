import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import type { RoleInput, RoleIssue } from '../../app/customRoles'
import { cap, translateKey } from '../../app/i18n'
import { useLang, useStore, useT } from '../../app/StoreContext'
import { MAX_ROLE_NAME } from '../../engine'
import { Button } from '../common/Button'
import { SideDot } from '../common/SideDot'

type Props = {
  title: string
  submitLabel: string
  initial?: RoleInput
  /** null — роль принята, форму можно закрыть. Иначе причина отказа: она показана строкой под полем. */
  onSubmit(input: RoleInput): RoleIssue | null
  onCancel(): void
}

/** Форма своей роли: название, сторона, ходит ли ночью. Одна и та же для новой роли и для правки. */
export function CustomRoleForm({ title, submitLabel, initial, onSubmit, onCancel }: Props) {
  const store = useStore()
  const t = useT()
  const lang = useLang()
  const sides = store.registry.sides
  const nameId = useId()
  const sideId = useId()
  const nightId = useId()
  const [name, setName] = useState(initial?.name ?? '')
  const [side, setSide] = useState(initial?.side ?? sides[0]?.id ?? '')
  const [night, setNight] = useState(initial?.night ?? true)
  const [issue, setIssue] = useState<RoleIssue | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setIssue(onSubmit({ name, side, night }))
  }
  const picked = sides.find((s) => s.id === side)
  const errorText = issue === 'empty' ? t('setup.custom.error.empty')
    : issue === 'duplicate' ? t('setup.custom.error.duplicate')
    : issue === 'limit' ? t('setup.custom.limit')
    : null

  return (
    <form
      className="role-form" aria-label={title} onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        onCancel()
      }}
    >
      <h3 className="h2 role-form-title">{title}</h3>

      <div className="role-form-fields">
        <div className="role-form-field">
          <label htmlFor={nameId} className="role-form-label">{t('setup.custom.name')}</label>
          <input
            id={nameId} type="text" className="role-form-input" value={name} maxLength={MAX_ROLE_NAME} autoComplete="off" autoFocus
            aria-invalid={errorText ? true : undefined}
            onChange={(e) => {
              setName(e.target.value)
              setIssue(null)
            }}
          />
          <span className="small muted">{t('setup.custom.name.hint')}</span>
          {errorText && <span className="role-form-error" role="alert">{errorText}</span>}
        </div>

        <fieldset className="role-form-field" role="radiogroup" aria-labelledby={sideId}>
          <legend id={sideId} className="role-form-label">{t('setup.custom.side')}</legend>
          <div className="role-form-sides">
            {sides.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={s.id === side} className="role-form-side" onClick={() => setSide(s.id)}>
                <SideDot registry={store.registry} side={s.id} />
                {cap(translateKey(lang, s.nameKey))}
              </button>
            ))}
          </div>
          {picked && (
            <span className="small muted">
              {t('setup.custom.side.hint', { gen: translateKey(lang, `${picked.nameKey}.gen`), seen: translateKey(lang, `${picked.nameKey}.seen`) })}
            </span>
          )}
        </fieldset>
      </div>

      <div className="role-form-night">
        <button type="button" role="switch" aria-checked={night} aria-labelledby={nightId} className="switch switch-night" onClick={() => setNight(!night)}>
          <span className="switch-track"><span className="switch-knob" /></span>
        </button>
        <div className="role-form-night-text">
          <span id={nightId} className="role-form-night-title">{t('setup.custom.night')}</span>
          <span className="muted">{t('setup.custom.night.hint')}</span>
        </div>
      </div>

      <div className="role-form-actions">
        <button type="submit" className="btn role-form-submit">{submitLabel}</button>
        <Button variant="outline" className="role-form-cancel" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </form>
  )
}
