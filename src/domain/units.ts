// PokéAPI gives height in decimetres and weight in hectograms (tenths of a metre / kilogram)

export function decimetresToMetres(decimetres: number): number {
  return decimetres / 10
}

export function hectogramsToKilograms(hectograms: number): number {
  return hectograms / 10
}
