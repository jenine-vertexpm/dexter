import { useEffect, useId, useRef, useState } from 'react'
import { downloadText } from '../lib/download.ts'
import type { StorageState } from '../teams/teamsReducer.ts'
import { useTeams } from '../teams/useTeams.ts'
import './StorageNotice.css'

// The file name for "Download saved data". The file holds the stored text exactly as it was.
export const SAVED_DATA_FILENAME = 'dexter-saved-teams.json'

// What to say for each storage problem (M3 plan T5, §4.1). null when storage is working normally.
function noticeText(storage: StorageState): string | null {
  switch (storage.status) {
    case 'ok':
      return null
    case 'salvaged': {
      const teams = storage.dropped === 1 ? 'team' : 'teams'
      return `${storage.dropped} saved ${teams} couldn't be read. Your other teams are shown, but changes aren't saved until you choose.`
    }
    case 'unreadable':
      return "Your saved teams couldn't be read."
    case 'newer-version':
      return 'Your teams were saved by a newer version of Dexter.'
    case 'unavailable':
      return 'Your browser is blocking storage, so teams will be lost when you close this tab.'
    case 'save-failed':
      return "Couldn't save your latest change (storage full). Export your teams to keep a copy."
  }
}

// Explains a storage problem and offers the ways out (decision D14). Shown on the Teams pages.
//
// While stored data is waiting for a choice (salvaged, unreadable, newer-version), nothing is
// written to storage: TeamsProvider refuses every change. Only the buttons here end that, and
// "Download" is always offered first, so the original can never be lost by accident.
export function StorageNotice() {
  const { storage, teams, resolveStorage } = useTeams()
  const headingId = useId()
  // Step 2 of "Start with no teams", which replaces the stored data
  const [confirmingStartOver, setConfirmingStartOver] = useState(false)
  // A short confirmation after a choice, e.g. "Kept your 2 valid teams."
  const [doneMessage, setDoneMessage] = useState<string | null>(null)

  // After a choice the notice and its buttons disappear. Focus moves to the confirmation
  // (or back to the button that opened step 2), so keyboard users don't lose their place.
  const focusNext = useRef<'done' | 'start-over' | 'cancel' | null>(null)
  const doneRef = useRef<HTMLParagraphElement>(null)
  const startOverRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const target = { done: doneRef, 'start-over': startOverRef, cancel: cancelRef }
    if (focusNext.current !== null) target[focusNext.current].current?.focus()
    focusNext.current = null
  }, [confirmingStartOver, doneMessage])

  const text = noticeText(storage)

  function downloadOriginal() {
    if ('original' in storage) downloadText(SAVED_DATA_FILENAME, storage.original)
  }

  function keepValidTeams() {
    const count = teams.length
    resolveStorage('keep-valid')
    focusNext.current = 'done'
    setDoneMessage(`Kept your ${count} valid ${count === 1 ? 'team' : 'teams'}.`)
  }

  function startOver() {
    resolveStorage('start-over')
    focusNext.current = 'done'
    setConfirmingStartOver(false)
    setDoneMessage('Started with no teams. You can create a new team now.')
  }

  function showConfirm(show: boolean) {
    focusNext.current = show ? 'cancel' : 'start-over'
    setConfirmingStartOver(show)
  }

  return (
    // aria-live: screen readers read out text that appears here later, e.g. "Couldn't save your
    // latest change" right after an action, or the confirmation after a choice
    <div aria-live="polite">
      {text === null && doneMessage !== null && (
        <p ref={doneRef} tabIndex={-1} className="storage-notice storage-notice-done">
          {doneMessage}
        </p>
      )}

      {text !== null && (
        <section className="storage-notice" aria-labelledby={headingId}>
          <h2 id={headingId}>Problem with your saved teams</h2>
          <p>{text}</p>

          {storage.status === 'salvaged' && (
            <>
              <p>Nothing is changed until you choose. You can download a copy first.</p>
              <div className="storage-notice-actions">
                <button type="button" onClick={downloadOriginal}>
                  Download original data
                </button>
                <button type="button" onClick={keepValidTeams}>
                  Keep the valid teams
                </button>
              </div>
            </>
          )}

          {(storage.status === 'unreadable' || storage.status === 'newer-version') && (
            <>
              <p>Nothing is changed until you choose. You can download a copy first.</p>
              <div className="storage-notice-actions">
                <button type="button" onClick={downloadOriginal}>
                  Download saved data
                </button>
                {!confirmingStartOver && (
                  <button ref={startOverRef} type="button" onClick={() => showConfirm(true)}>
                    Start with no teams
                  </button>
                )}
              </div>
              {confirmingStartOver && (
                <>
                  <p>
                    Start with no teams? This replaces your saved data and can't be undone.
                    Download it first if you might need it.
                  </p>
                  <div className="storage-notice-actions">
                    <button type="button" onClick={startOver}>
                      Yes, start with no teams
                    </button>
                    <button ref={cancelRef} type="button" onClick={() => showConfirm(false)}>
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
