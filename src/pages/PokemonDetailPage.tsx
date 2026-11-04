import { useParams } from 'react-router'
import { ApiError } from '../api/client.ts'
import { ErrorMessage } from '../components/ErrorMessage.tsx'
import { EvolutionChain } from '../components/EvolutionChain.tsx'
import { SpeciesNav } from '../components/SpeciesNav.tsx'
import { StatBars } from '../components/StatBars.tsx'
import { TypeMatchups } from '../components/TypeMatchups.tsx'
import { formatName, formatPokemonNumber } from '../domain/format.ts'
import { defaultVarietyName, toPokemonDetail, type PokemonDetail } from '../domain/pokemon.ts'
import { usePokemon, useSpecies } from '../queries/pokeApiQueries.ts'
import { NotFoundPage } from './NotFoundPage.tsx'
import './PokemonDetailPage.css'

export const DETAIL_ARTWORK_SIZE = 240

// /pokemon/:name, where `name` is a species name (plan decision D7). Two requests, one after the other:
// 1. the species, e.g. "deoxys", which says which of its Pokémon is the default ("deoxys-normal");
// 2. that Pokémon, for artwork, types, size, stats and abilities.
// When `name` changes, both queries switch to the new name. TanStack Query cancels the old
// requests and the old Pokémon's data is never shown for the new name (plan S5).
export function PokemonDetailPage() {
  const { name = '' } = useParams()
  const species = useSpecies(name)
  const varietyName = species.data ? defaultVarietyName(species.data) : null
  const pokemon = usePokemon(varietyName)

  // An unknown species (a typo like "pikachuu", or a form name like "pikachu-gmax") gets the same
  // not-found view as any other unknown address
  if (species.error instanceof ApiError && species.error.kind === 'not-found') {
    return <NotFoundPage />
  }
  if (species.isError) {
    return <ErrorMessage error={species.error} onRetry={() => void species.refetch()} what={name} />
  }
  if (species.data && varietyName === null) {
    // PokéAPI says every species has a default Pokémon; this only happens if that ever stops being true
    const error = new ApiError('invalid-response', `Species "${name}" has no default Pokémon`)
    return <ErrorMessage error={error} onRetry={() => void species.refetch()} what={name} />
  }
  if (pokemon.isError) {
    return <ErrorMessage error={pokemon.error} onRetry={() => void pokemon.refetch()} what={name} />
  }
  if (!species.data || !pokemon.data) {
    return <p role="status">Loading Pokémon…</p>
  }

  return <PokemonDetails detail={toPokemonDetail(pokemon.data, species.data)} />
}

function PokemonDetails({ detail }: { detail: PokemonDetail }) {
  return (
    <article className="pokemon-detail">
      <div className="detail-heading">
        <h1 className="detail-name">{detail.name}</h1>
        <p className="detail-number">{formatPokemonNumber(detail.id)}</p>
        {/* Types as text, never colour alone (brief §3.1) */}
        <ul className="detail-types" aria-label="Types">
          {detail.types.map((type) => (
            <li key={type}>{type}</li>
          ))}
        </ul>
      </div>

      <div className="detail-columns">
        {detail.artworkUrl ? (
          // width/height reserve the space, so the page does not jump while the image loads
          <img
            className="detail-artwork"
            src={detail.artworkUrl}
            alt={`Official artwork of ${detail.name}`}
            width={DETAIL_ARTWORK_SIZE}
            height={DETAIL_ARTWORK_SIZE}
            loading="lazy"
          />
        ) : (
          <div className="detail-artwork detail-artwork-missing">No artwork</div>
        )}

        <div className="detail-info">
          {detail.description && <p className="detail-description">{detail.description}</p>}

          <dl className="detail-measurements">
            <div>
              <dt>Height</dt>
              <dd>{detail.heightMetres} m</dd>
            </div>
            <div>
              <dt>Weight</dt>
              <dd>{detail.weightKilograms} kg</dd>
            </div>
          </dl>

          <section aria-labelledby="abilities-heading">
            <h2 id="abilities-heading">Abilities</h2>
            <ul className="detail-abilities">
              {detail.abilities.map((ability) => (
                <li key={ability.name}>
                  {formatName(ability.name)}
                  {/* "Hidden" is written out, so it is not shown by styling alone */}
                  {ability.isHidden && <span className="hidden-ability"> (hidden ability)</span>}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="stats-heading">
            <h2 id="stats-heading">Base stats</h2>
            <StatBars stats={detail.stats} />
          </section>
        </div>
      </div>

      {/* PokéAPI's docs don't promise every species has a chain; without one the section is left out */}
      {detail.evolutionChainId !== null && (
        <EvolutionChain chainId={detail.evolutionChainId} currentName={detail.name} />
      )}

      <TypeMatchups types={detail.types} />

      <SpeciesNav id={detail.id} />
    </article>
  )
}
