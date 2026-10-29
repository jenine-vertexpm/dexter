import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { createQueryClient } from './queries/queryClient.ts'

// One cache for the whole visit: everything loaded from PokéAPI is kept here and reused
const queryClient = createQueryClient()

// BrowserRouter keeps the app in sync with the address bar and the Back/Forward buttons
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
