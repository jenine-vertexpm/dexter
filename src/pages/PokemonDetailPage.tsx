import { useParams } from 'react-router'

// Placeholder: the detail page is built in plan steps S9–S11.
// `name` comes from the URL, e.g. "eevee" for /pokemon/eevee.
export function PokemonDetailPage() {
  const { name } = useParams()
  return <h1>{name}</h1>
}
