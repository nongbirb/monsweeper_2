// Configuration for Monsweeper contracts
export const CONFIG = {
  // Original contract with Pyth Entropy (for production)
  ORIGINAL_CONTRACT: {
    address: import.meta.env.VITE_CONTRACT_ADDRESS || "0x1e0B2A54460a6b061EC987646Be5526fEfe6e4CA",
    name: "Monsweeper (with Entropy)",
    description: "Full version with Pyth Entropy for secure randomness",
    hasEntropy: true,
    timeout: 15000, // 15 seconds
  },
  
  // Simple contract without entropy (for testing/instant play)
  SIMPLE_CONTRACT: {
    address: "0x1e0B2A54460a6b061EC987646Be5526fEfe6e4CA", // Updated to user's deployment
    name: "Monsweeper Simple (Instant)",
    description: "Simple version for immediate gameplay - no entropy delays",
    hasEntropy: false,
    timeout: 0, // No timeout needed
  }
};

// Default contract to use
export const DEFAULT_CONTRACT = CONFIG.SIMPLE_CONTRACT;

// Environment-based contract selection
export function getContractConfig() {
  const env = import.meta.env.VITE_CONTRACT_TYPE;
  
  if (env === "simple") {
    return CONFIG.SIMPLE_CONTRACT;
  } else if (env === "original") {
    return CONFIG.ORIGINAL_CONTRACT;
  }
  
  // Default to simple for better UX
  return CONFIG.SIMPLE_CONTRACT;
} 