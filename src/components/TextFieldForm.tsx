import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { TeamsResult } from '../domain/team.ts'
import './TextFieldForm.css'

// A small form with one text field: a team name (create and rename, M3 plan T4) or a nickname
// (T6). It doesn't know any rules itself: the page passes in `check` and `submit`, which use the
// T1 rules in src/domain/team.ts, so the rules live in one place only (decision D13).
//
// Accessibility:
// - the message appears under the field, and the field points to it with aria-describedby
// - aria-invalid tells screen readers the field has a problem
// - when a submit fails, focus goes back to the field so the user can fix it straight away
// - once a message has been shown, it is re-checked as the user types, so it disappears when fixed
export function TextFieldForm({
  label,
  hint,
  submitLabel,
  initialValue = '',
  check,
  submit,
  onCancel,
  focusOnMount = false,
  clearAfterSubmit = false,
  disabled = false,
}: {
  label: string
  // A short line under the label, e.g. "Up to 30 characters."
  hint: string
  // Can include text for screen readers only, so several "Save" buttons can be told apart
  submitLabel: ReactNode
  initialValue?: string
  // Checks a value without changing anything; returns a message, or null if it is fine
  check: (value: string) => string | null
  // Makes the change. On failure the message is shown under the field.
  submit: (value: string) => TeamsResult
  // When given, a Cancel button is shown (used by rename)
  onCancel?: () => void
  focusOnMount?: boolean
  clearAfterSubmit?: boolean
  // Turns off the field and the submit button, e.g. while saved teams wait for a recovery
  // choice (plan §4.1). Cancel stays usable, so the user can always back out.
  disabled?: boolean
}) {
  // useId gives ids that are unique on the page, so several forms can be shown at once
  const id = useId()
  const inputId = `${id}-field`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)
  // True after a submit has failed: from then on the value is re-checked on every change
  const [checkWhileTyping, setCheckWhileTyping] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Rename opens with the field focused and its text selected, ready to type over
  useEffect(() => {
    if (!focusOnMount) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusOnMount])

  function changeValue(next: string) {
    setValue(next)
    if (checkWhileTyping) setError(check(next))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Stops the browser's normal form submit, which would reload the page
    event.preventDefault()
    const result = submit(value)
    if (result.ok) {
      setError(null)
      setCheckWhileTyping(false)
      if (clearAfterSubmit) setValue('')
      return
    }
    setError(result.message)
    setCheckWhileTyping(true)
    inputRef.current?.focus()
  }

  return (
    // noValidate: our own messages are shown instead of the browser's pop-ups
    <form className="text-field-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor={inputId}>{label}</label>
      <p id={hintId} className="field-hint">
        {hint}
      </p>
      <div className="text-field-form-row">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          autoComplete="off"
          value={value}
          disabled={disabled}
          onChange={(event) => changeValue(event.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error === null ? hintId : `${hintId} ${errorId}`}
        />
        <button type="submit" disabled={disabled}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {error !== null && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </form>
  )
}
