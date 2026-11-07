import { lazy, Suspense, type ReactNode } from 'react'
import { Route, Routes } from 'react-router'
import { Layout } from './components/Layout.tsx'

// Each page is loaded only when it is first needed ("code splitting", decision D29).
// lazy() makes the build put each page in its own file, downloaded the first time its URL
// is opened. The pages use named exports, and lazy() wants a default one, so `.then`
// hands it the page under the name `default`.
const PokemonListPage = lazy(() =>
  import('./pages/PokemonListPage.tsx').then((m) => ({ default: m.PokemonListPage })),
)
const PokemonDetailPage = lazy(() =>
  import('./pages/PokemonDetailPage.tsx').then((m) => ({ default: m.PokemonDetailPage })),
)
const TeamsPage = lazy(() => import('./pages/TeamsPage.tsx').then((m) => ({ default: m.TeamsPage })))
const TeamDetailPage = lazy(() =>
  import('./pages/TeamDetailPage.tsx').then((m) => ({ default: m.TeamDetailPage })),
)
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage.tsx').then((m) => ({ default: m.NotFoundPage })),
)

// While a page's file is downloading, Suspense shows the fallback message instead.
// It wraps each page (not the whole app), so the Layout header stays on screen meanwhile.
function page(element: ReactNode) {
  return <Suspense fallback={<p role="status">Loading page…</p>}>{element}</Suspense>
}

// Which page to show for which URL. Every page is shown inside Layout.
function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={page(<PokemonListPage />)} />
        <Route path="pokemon/:name" element={page(<PokemonDetailPage />)} />
        <Route path="teams" element={page(<TeamsPage />)} />
        <Route path="teams/:teamId" element={page(<TeamDetailPage />)} />
        <Route path="*" element={page(<NotFoundPage />)} />
      </Route>
    </Routes>
  )
}

export default App
