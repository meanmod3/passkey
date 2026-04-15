import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import {
  FluentProvider,
  teamsLightTheme,
  teamsDarkTheme,
  teamsHighContrastTheme,
} from '@fluentui/react-components';
import App from './App';
import { useTeamsTheme } from './hooks/useTeamsTheme';
import './index.css';

const keeperLightTheme = {
  ...teamsLightTheme,
  colorBrandBackground: '#4f46e5',
  colorBrandBackgroundHover: '#4338ca',
  colorBrandBackgroundPressed: '#3730a3',
  colorBrandBackgroundSelected: '#4338ca',
  colorCompoundBrandBackground: '#4f46e5',
  colorCompoundBrandBackgroundHover: '#4338ca',
  colorCompoundBrandBackgroundPressed: '#3730a3',
  colorCompoundBrandStroke: '#4f46e5',
  colorCompoundBrandStrokeHover: '#4338ca',
  colorCompoundBrandStrokePressed: '#3730a3',
  colorNeutralForegroundOnBrand: '#ffffff',
};

function Root(): JSX.Element {
  const theme = useTeamsTheme();
  const fluentTheme =
    theme === 'dark' ? teamsDarkTheme : theme === 'highContrast' ? teamsHighContrastTheme : keeperLightTheme;

  return (
    <div className="ks-root-shell">
      <FluentProvider theme={fluentTheme} applyStylesToPortals>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </FluentProvider>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
