import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'pe.effe.clasificados',
  appName: 'eFFe Clasificados',
  webDir: 'dist',
  plugins: {
    Keyboard: {
      // 'native': al abrir el teclado, la vista web se redimensiona y la barra
      // de mensaje queda por encima del teclado (como WhatsApp).
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
