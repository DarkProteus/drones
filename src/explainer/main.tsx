import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Explainer } from './Explainer';
import '../theme.css';
import './explainer.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Explainer />
  </StrictMode>,
);
