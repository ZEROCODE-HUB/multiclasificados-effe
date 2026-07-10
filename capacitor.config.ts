import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.effe.multiclasificados',
  appName: 'eFFe Clasificados',
  webDir: 'dist',
  // Fondo blanco de la vista para evitar el destello negro mientras carga la web.
  backgroundColor: '#ffffff',
  plugins: {
    Keyboard: {
      // 'native': al abrir el teclado, la vista web se redimensiona y la barra
      // de mensaje queda por encima del teclado (como WhatsApp).
      resize: 'native',
      resizeOnFullScreen: true,
    },
    SplashScreen: {
      // Splash blanco que se oculta de inmediato: el arranque es rápido y el
      // fondo blanco de la WebView evita el destello negro mientras carga.
      launchAutoHide: true,
      launchShowDuration: 0,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
    CapacitorUpdater: {
      // OTA manual controlada por la BD (lib/ota.ts): NO auto-contactamos la
      // nube de Capgo. Con autoUpdate en false, sin bundle configurado la app
      // usa el APK instalado y no hace nada extra.
      autoUpdate: false,
      // notifyAppReady lo llamamos nosotros en initOta() para evitar rollbacks.
      resetWhenUpdate: true,
    },
  },
};

export default config;
