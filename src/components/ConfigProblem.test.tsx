import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConfigProblem } from './ConfigProblem.tsx'

describe('ConfigProblem', () => {
  it('tells the visitor the app could not start and what to try', () => {
    render(<ConfigProblem />)

    expect(screen.getByRole('heading', { level: 1, name: "Dexter isn't configured correctly" })).toBeInTheDocument()
    expect(screen.getByText(/Try reloading the page/)).toBeInTheDocument()
  })
})
