import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { createQueryClient } from './queries/queryClient.ts'

// One cache for the whole visit: everything loaded from PokéAPI is kept here and reused - shared manager for cached data
const queryClient = createQueryClient()

// BrowserRouter keeps the app in sync with the address bar and the Back/Forward buttons.
// useTransitions={false}: apply URL changes straight away. The search box shows the URL's `q`,
// and React cannot keep a text box in step with a delayed ("transition") update.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter useTransitions={false}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
