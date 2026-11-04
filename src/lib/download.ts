// Saves some text to a file on the user's computer, as if they had clicked a download link
// (M3 plan T5; the team export in T9 uses it too).
//
// How it works:
// 1. a Blob is a chunk of data held by the browser; we put the text in one
// 2. an "object URL" (blob:...) is a temporary address the browser gives that data
// 3. a hidden link with the `download` attribute, pointing at that address, is clicked,
//    which makes the browser save the file instead of opening it
// 4. the temporary address is released ("revoked") so the browser can free the memory.
//    This waits a moment, because some browsers start reading the data just after the click.
export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  // Firefox only follows clicks on links that are in the page
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
