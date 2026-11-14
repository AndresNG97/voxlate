import React from 'react';
import ReactDOM from 'react-dom/client';
import { uiLocale } from '@/i18n';
import App from './App';
import './style.css';

document.documentElement.lang = uiLocale;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
