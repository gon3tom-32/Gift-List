import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerServiceWorker } from './lib/push';
import './styles.css';
import './themes/hawaii.css';
import { applyTheme, readTheme } from './lib/theme';

applyTheme(readTheme());
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
