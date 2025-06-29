// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { PrivyProvider } from '@privy-io/react-auth';
import './index.css'; // Assuming you have a global CSS file for tailwind or other base styles

// Monad Testnet configuration (same as in App.jsx, but good to have it here for PrivyProvider)
const MONAD_TESTNET = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID} // Ensure your .env variable is correct
      chains={[MONAD_TESTNET]}
      config={{
        embeddedWallets: {
          createOnLogin: 'users-and-eoa',
          noPromptOnSignature: false,
        },
        loginMethods: ['email', 'wallet', 'google', 'twitter', 'sms'],
        appearance: {
          theme: 'dark',
          accentColor: '#676FFF',
          logo: 'https://media.discordapp.net/attachments/855062375610974219/1386585806994673684/GNNpovga0AA68cf.png?ex=6860d5a9&is=685f8429&hm=dafc728130583070cff87d4f38eb9adf117139cd1a04ec91c3048dce5a870e07&=&format=webp&quality=lossless&width=362&height=350', // REMEMBER TO REPLACE THIS WITH YOUR ACTUAL LOGO URL
        },
        // Add other Privy config if necessary
      }}
    >
      <App />
    </PrivyProvider>
  </React.StrictMode>,
);