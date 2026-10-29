import { describe, expect, it } from 'vitest'
import { MAX_SEARCH_LENGTH, parseListParams, toListParams, type ListState } from './listParams.ts'

const parse = (query: string) => parseListParams(new URLSearchParams(query))

describe('parseListParams', () => {
  it('reads page, search and types from the URL', () => {
    expect(parse('q=char&type=fire&type=flying&page=2')).toEqual({ page: 2, search: 'char', types: ['fire', 'flying'] })
  })

  it('uses defaults when the URL has no parameters', () => {
    expect(parse('')).toEqual({ page: 1, search: '', types: [] })
  })

  it.each(['-1', '0', 'abc', '2.5', '1e3', '', '99999999999999999999'])('treats page=%s as page 1', (page) => {
    expect(parse(`page=${page}`).page).toBe(1)
  })

  it('ignores types that are not battle types', () => {
    expect(parse('type=stellar&type=shadow&type=unknown&type=banana').types).toEqual([])
  })

  it('keeps at most two types and drops repeats', () => {
    expect(parse('type=fire&type=fire&type=water&type=grass').types).toEqual(['fire', 'water'])
  })

  it('accepts type names in any case', () => {
    expect(parse('type=FIRE').types).toEqual(['fire'])
  })

  it('decodes encoded characters and keeps the search exactly as typed, including spaces', () => {
    expect(parse('q=mr%20mime%20').search).toBe('mr mime ')
  })

  it('keeps markup-like text as plain text (React shows it as text, never as HTML)', () => {
    expect(parse('q=%3Cimg%20src%3Dx%3E').search).toBe('<img src=x>')
  })

  it(`cuts the search to ${MAX_SEARCH_LENGTH} characters`, () => {
    expect(parse(`q=${'a'.repeat(500)}`).search).toHaveLength(MAX_SEARCH_LENGTH)
  })
})

describe('toListParams', () => {
  it('leaves default values out of the URL', () => {
    expect(toListParams({ page: 1, search: '', types: [] }).toString()).toBe('')
  })

  it('writes every non-default value', () => {
    expect(toListParams({ page: 2, search: 'mr mime', types: ['fire', 'flying'] }).toString()).toBe(
      'q=mr+mime&type=fire&type=flying&page=2',
    )
  })

  it('round-trips: reading back what it wrote gives the same state', () => {
    const states: ListState[] = [
      { page: 1, search: '', types: [] },
      { page: 3, search: 'char', types: ['fire'] },
      { page: 2, search: 'a b&c=d', types: ['bug', 'steel'] },
    ]
    for (const state of states) {
      expect(parseListParams(toListParams(state))).toEqual(state)
    }
  })
})
