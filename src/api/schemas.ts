import { z } from 'zod'

// PokéAPI links to other resources as { name, url } pairs
const namedResourceSchema = z.object({
  name: z.string(),
  url: z.string(),
})

// GET /pokemon/{name}. Only the fields we use are listed; zod drops the rest
// (the full response is ~250 KB, mostly moves).
export const pokemonSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  // Raw API units: decimetres and hectograms
  height: z.number().int().nonnegative(),
  weight: z.number().int().nonnegative(),
  types: z
    .array(
      z.object({
        slot: z.number().int(),
        type: namedResourceSchema,
      }),
    )
    .min(1),
  stats: z.array(
    z.object({
      base_stat: z.number().int(),
      stat: namedResourceSchema,
    }),
  ),
  abilities: z.array(
    z.object({
      is_hidden: z.boolean(),
      slot: z.number().int(),
      ability: namedResourceSchema,
    }),
  ),
  sprites: z.object({
    other: z.object({
      'official-artwork': z.object({
        // Some Pokémon have no official artwork
        front_default: z.string().nullable(),
      }),
    }),
  }),
  species: namedResourceSchema,
})

export type ApiPokemon = z.infer<typeof pokemonSchema>

// GET /pokemon-species?limit=… : every species as a { name, url } pair, one request
export const speciesIndexSchema = z
  .object({
    count: z.number().int().nonnegative(),
    results: z.array(namedResourceSchema),
  })
  // If PokéAPI ever caps `limit`, we would silently lose species. Fail loudly instead.
  .refine((index) => index.results.length === index.count, {
    message: 'Species index is incomplete: fewer results than count',
  })

export type ApiSpeciesIndex = z.infer<typeof speciesIndexSchema>

// GET /pokemon-species/{name}
export const speciesSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  // Exactly one variety has is_default: true (PokéAPI docs). Its name can differ from the
  // species name: species "deoxys" → Pokémon "deoxys-normal".
  varieties: z
    .array(
      z.object({
        is_default: z.boolean(),
        pokemon: namedResourceSchema,
      }),
    )
    .min(1),
  // Nullable as a precaution: the docs don't say every species has a chain
  evolution_chain: z.object({ url: z.string() }).nullable(),
  // Raw text: contains line breaks and form feeds (\n, \f), cleaned up in the mapping layer
  flavor_text_entries: z.array(
    z.object({
      flavor_text: z.string(),
      language: namedResourceSchema,
      version: namedResourceSchema,
    }),
  ),
})

export type ApiSpecies = z.infer<typeof speciesSchema>

// One step in an evolution chain. `evolves_to` is a list, so a chain is a tree that can branch
// (Eevee has 8 evolutions). The getter lets the schema refer to itself (zod 4 docs).
const chainLinkSchema = z.object({
  is_baby: z.boolean(),
  species: namedResourceSchema,
  get evolves_to() {
    return z.array(chainLinkSchema)
  },
})

export type ApiChainLink = z.infer<typeof chainLinkSchema>

// GET /evolution-chain/{id}
export const evolutionChainSchema = z.object({
  id: z.number().int().positive(),
  chain: chainLinkSchema,
})

export type ApiEvolutionChain = z.infer<typeof evolutionChainSchema>

// GET /type/{name}. Only the "damage from" lists: we show how much damage this Pokémon takes.
export const typeSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  damage_relations: z.object({
    no_damage_from: z.array(namedResourceSchema),
    half_damage_from: z.array(namedResourceSchema),
    double_damage_from: z.array(namedResourceSchema),
  }),
  // Includes alternate forms (ids above 10000), not just one entry per species
  pokemon: z.array(
    z.object({
      slot: z.number().int(),
      pokemon: namedResourceSchema,
    }),
  ),
})

export type ApiType = z.infer<typeof typeSchema>
