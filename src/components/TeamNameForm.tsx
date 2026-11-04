import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { MAX_TEAM_NAME_LENGTH, type TeamsResult } from '../domain/team.ts'

// A small form with one team-name field, used to create a team and to rename one (M3 plan T4).
// It doesn't know the name rules itself: the page passes in `check` and `submit`, which use the
// T1 rules in src/domain/team.ts, so the rules live in one place only (decision D13).
//
// Accessibility:
// - the message appears under the field, and the field points to it with aria-describedby
// - aria-invalid tells screen readers the field has a problem
// - when a submit fails, focus goes back to the field so the user can fix it straight away
// - once a message has been shown, it is re-checked as the user types, so it disappears when fixed
export function TeamNameForm({
  label,
  submitLabel,
  initialName = '',
  check,
  submit,
  onCancel,
  focusOnMount = false,
  clearAfterSubmit = false,
}: {
  label: string
  submitLabel: string
  initialName?: string
  // Checks a name without changing anything; returns a message, or null if the name is fine
  check: (name: string) => string | null
  // Makes the change. On failure the message is shown under the field.
  submit: (name: string) => TeamsResult
  // When given, a Cancel button is shown (used by rename)
  onCancel?: () => void
  focusOnMount?: boolean
  clearAfterSubmit?: boolean
}) {
  // useId gives ids that are unique on the page, so several forms can be shown at once
  const id = useId()
  const inputId = `${id}-name`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  const [name, setName] = useState(initialName)
  const [error, setError] = useState<string | null>(null)
  // True after a submit has failed: from then on the name is re-checked on every change
  const [checkWhileTyping, setCheckWhileTyping] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Rename opens with the field focused and its text selected, ready to type over
  useEffect(() => {
    if (!focusOnMount) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusOnMount])

  function changeName(value: string) {
    setName(value)
    if (checkWhileTyping) setError(check(value))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Stops the browser's normal form submit, which would reload the page
    event.preventDefault()
    const result = submit(name)
    if (result.ok) {
      setError(null)
      setCheckWhileTyping(false)
      if (clearAfterSubmit) setName('')
      return
    }
    setError(result.message)
    setCheckWhileTyping(true)
    inputRef.current?.focus()
  }

  return (
    // noValidate: our own messages are shown instead of the browser's pop-ups
    <form className="team-name-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor={inputId}>{label}</label>
      <p id={hintId} className="field-hint">
        Up to {MAX_TEAM_NAME_LENGTH} characters.
      </p>
      <div className="team-name-form-row">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          autoComplete="off"
          value={name}
          onChange={(event) => changeName(event.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error === null ? hintId : `${hintId} ${errorId}`}
        />
        <button type="submit">{submitLabel}</button>
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
