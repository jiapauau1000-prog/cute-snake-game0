import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import './index.css';
import App from './App';

async function bootstrapNative() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0B4F6C' });
  } catch {
    // Status bar plugin may be unavailable on some devices.
  }
  try {
    await SplashScreen.hide();
  } catch {
    // Splash already hidden.
  }
}

void bootstrapNative();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
