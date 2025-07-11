// Contract Configuration
// Use this file to set contract addresses for different environments

export const CONTRACT_CONFIG = {
  // Development/Testing
  development: {
    contractAddress: "0x0000000000000000000000000000000000000000", // Replace with deployed contract
    networkId: 10143,
    networkName: "Monad Testnet"
  },
  
  // Production
  production: {
    contractAddress: "0x0000000000000000000000000000000000000000", // Replace with production contract
    networkId: 10143,
    networkName: "Monad Testnet"
  }
};

// Get current configuration
const isDevelopment = import.meta.env.MODE === 'development';
export const currentConfig = isDevelopment ? CONTRACT_CONFIG.development : CONTRACT_CONFIG.production;

// Helper function to get contract address
export const getContractAddress = () => {
  // Try environment variable first
  const envAddress = import.meta.env.VITE_CONTRACT_ADDRESS;
  if (envAddress && envAddress !== "0x0000000000000000000000000000000000000000") {
    return envAddress;
  }
  
  // Fall back to config file
  return currentConfig.contractAddress;
}; 