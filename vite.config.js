import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills'; // Correct import

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // To enable Buffer polyfill
      protocolImports: true,
    }),
  ],
  // Add this for better resolution for some packages
  resolve: {
    alias: {
      './runtimeConfig': './runtimeConfig.browser', // This is common for some libraries like aws-sdk, might not be needed for privy
    },
  },
});