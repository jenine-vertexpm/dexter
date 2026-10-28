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
