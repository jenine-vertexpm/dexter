// Shown instead of the whole app when /config.js is missing or invalid (src/config.ts, M5 plan R3),
// so the visitor sees what happened rather than a blank page. The details go to the browser console
// (main.tsx). The container refuses to start with bad settings, so in practice this means /config.js
// didn't load, e.g. a network problem; reloading is the visitor's best option.
export function ConfigProblem() {
  return (
    <main>
      <h1>Dexter isn't configured correctly</h1>
      <p>The app's settings could not be loaded, so it can't start. Try reloading the page.</p>
    </main>
  )
}
