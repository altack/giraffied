// Theme bootstrap MUST run before any React render. Imported as the very
// first side-effecting module so the data-theme attribute is set on <html>
// before the main bundle's CSS is resolved (which avoids a flash of the
// default theme on every load). The Vite build collapses our two script
// tags in index.html into a single bundle, so importing here is the only
// reliable way to keep this prepaint.
import '@/theme-bootstrap';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { queryClient } from '@/lib/queryClient';
import './globals.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
