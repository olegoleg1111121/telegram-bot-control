import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import WebRoot from './web-client';
import './style.css';
import './onboarding.css';
import './web.css';
import './fonts.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{window.botControl ? <App /> : <WebRoot />}</React.StrictMode>,
);
