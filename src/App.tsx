import { Route, Routes } from 'react-router'
import { Layout } from './components/Layout.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { PokemonDetailPage } from './pages/PokemonDetailPage.tsx'
import { PokemonListPage } from './pages/PokemonListPage.tsx'
import { TeamDetailPage } from './pages/TeamDetailPage.tsx'
import { TeamsPage } from './pages/TeamsPage.tsx'

// Which page to show for which URL. Every page is shown inside Layout.
function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<PokemonListPage />} />
        <Route path="pokemon/:name" element={<PokemonDetailPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="teams/:teamId" element={<TeamDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default App
