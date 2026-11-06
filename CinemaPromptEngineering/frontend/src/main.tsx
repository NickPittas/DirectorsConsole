import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { initializeAgentGatewayFromLocation, loadAgentSettings } from './services/agent-gateway-client'

initializeAgentGatewayFromLocation()
void loadAgentSettings()

const queryClient = new QueryClient()

void import('./App').then(({ default: App }) => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>,
  )
})
