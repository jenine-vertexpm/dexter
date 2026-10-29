import { Route, Routes } from 'react-router'
import { Layout } from './components/Layout.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { PokemonDetailPage } from './pages/PokemonDetailPage.tsx'
import { PokemonListPage } from './pages/PokemonListPage.tsx'

// Which page to show for which URL. Every page is shown inside Layout.
// Team pages come in M3.
function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<PokemonListPage />} />
        <Route path="pokemon/:name" element={<PokemonDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default App
