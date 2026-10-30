import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.opencode.agent',
  appName: 'OpenCode Agent',
  webDir: 'dist-app',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
  },
};

export default config;
