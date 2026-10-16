import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { MedPassProvider } from './contexts/MedPassProvider';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <MedPassProvider>
      <App />
    </MedPassProvider>
  </StrictMode>,
);
