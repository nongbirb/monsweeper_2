// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { createAppKit } from '@reown/appkit/react';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { mainnet, sepolia } from '@reown/appkit/networks';
import './index.css'; // Assuming you have a global CSS file for tailwind or other base styles

// Monad Testnet configuration
const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'Monad Explorer', url: 'https://testnet-explorer.monad.xyz' } },
  testnet: true
};

// 1. Get projectId from https://cloud.reown.com
const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || 'your-project-id-here';

// 2. Set up the Ethers adapter
const ethersAdapter = new EthersAdapter();

// 3. Configure the metadata
const metadata = {
  name: 'Monsweeper',
  description: 'A minesweeper game on Monad',
  url: 'https://monsweeper.monad.xyz', // origin must match your domain & subdomain
  icons: ['https://avatars.githubusercontent.com/u/179229932']
};

// 4. Create the modal
const modal = createAppKit({
  adapters: [ethersAdapter],
  projectId,
  networks: [monadTestnet, mainnet, sepolia],
  metadata,
  features: {
    analytics: true, // Optional - defaults to your Cloud configuration
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#676FFF'
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);