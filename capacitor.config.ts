import type { CapacitorConfig } from '@capacitor/cli'

const konfiguracja: CapacitorConfig = {
  appId: 'pl.ogarniacz.app',
  appName: 'Ogarniacz',
  webDir: 'dist',
  backgroundColor: '#f3f5f5',
  server: {
    androidScheme: 'https',
  },
}

export default konfiguracja
