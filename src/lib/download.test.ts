import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadText } from './download.ts'

// The browser's file-download machinery is replaced with fakes (M3 plan §2: jsdom can't download),
// so the test can see what would have been saved and check the temporary URL is released.
function stubDownloads() {
  const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url')
  const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  // jsdom can't follow links, so the click is recorded instead of performed
  const clicked: HTMLAnchorElement[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this)
  })
  return { createObjectURL, revokeObjectURL, clicked }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('downloadText', () => {
  it('saves the exact text, under the file name, through a temporary link', async () => {
    const { createObjectURL, clicked } = stubDownloads()
    const text = '{"version":1,"teams":[{"name":"  odd spacing  "}]}'

    downloadText('teams.json', text)

    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(await blob.text()).toBe(text)
    expect(blob.type).toBe('application/json')
    expect(clicked).toHaveLength(1)
    expect(clicked[0].href).toBe('blob:fake-url')
    expect(clicked[0].download).toBe('teams.json')
    // The link was only there for the click
    expect(document.querySelector('a')).toBeNull()
  })

  it('releases the temporary URL after the download has started', () => {
    vi.useFakeTimers()
    const { revokeObjectURL } = stubDownloads()

    downloadText('teams.json', 'text')
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.runAllTimers()

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url')
  })

  it('uses the type it is given', () => {
    const { createObjectURL } = stubDownloads()

    downloadText('notes.txt', 'hello', 'text/plain')

    expect((createObjectURL.mock.calls[0][0] as Blob).type).toBe('text/plain')
  })
})
