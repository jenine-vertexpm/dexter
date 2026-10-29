import { describeError } from './describeError.ts'

interface ErrorMessageProps {
  error: unknown
  onRetry: () => void
  // What failed, e.g. "the Pokémon list". Used in the message and the button's label.
  what: string
}

// Every error state offers a retry (brief §3.1). role="alert" makes screen readers announce it.
export function ErrorMessage({ error, onRetry, what }: ErrorMessageProps) {
  return (
    <div role="alert" className="error-message">
      <p>
        Could not load {what}. {describeError(error)}
      </p>
      <button type="button" onClick={onRetry} aria-label={`Retry loading ${what}`}>
        Retry
      </button>
    </div>
  )
}
