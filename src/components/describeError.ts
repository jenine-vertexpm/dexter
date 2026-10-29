import { ApiError } from '../api/client.ts'

// A plain-English sentence for each way a request can fail
export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong.'
  switch (error.kind) {
    case 'network':
      return 'Could not reach PokéAPI. Check your connection.'
    case 'timeout':
      return 'PokéAPI took too long to answer.'
    case 'http':
      return `PokéAPI had a problem (error ${error.status ?? 'unknown'}).`
    case 'invalid-response':
      return 'PokéAPI sent data in a form we did not expect.'
    case 'not-found':
      return 'PokéAPI could not find this.'
  }
}
