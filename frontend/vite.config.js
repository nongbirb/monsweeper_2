import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills'; // Import the plugin

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Add the nodePolyfills plugin here
    nodePolyfills({
      // To enable Buffer polyfill
      protocolImports: true,
    }),
  ],
  // You might also need to add a resolve alias for some older packages,
  // but let's try with just the polyfills first.
  // resolve: {
  //   alias: {
  //     './runtimeConfig': './runtimeConfig.browser',
  //   },
  // },
});