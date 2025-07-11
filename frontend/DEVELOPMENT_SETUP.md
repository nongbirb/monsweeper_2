# Development Setup Guide

## Issues You're Seeing

The console errors indicate several setup issues:

1. **Contract Address Not Set**: The `VITE_CONTRACT_ADDRESS` environment variable is not configured
2. **Contract Not Deployed**: The SecureMonsweeper contract hasn't been deployed to the testnet
3. **Network Issues**: Some RPC connection problems with the Monad testnet

## Quick Fix Steps

### 1. Deploy the Contract First

Before running the frontend, you need to deploy the smart contract:

```bash
# Install Hardhat dependencies
npm install --save-dev hardhat @nomiclabs/hardhat-ethers ethers

# Deploy the contract
npx hardhat run scripts/deploy.js --network monad-testnet
```

### 2. Set Environment Variables

Create a `.env` file in the root directory:

```env
VITE_CONTRACT_ADDRESS=0xYourDeployedContractAddress
```

### 3. Alternative: Use Config File

If you can't use environment variables, update `contract-config.js`:

```javascript
export const CONTRACT_CONFIG = {
  development: {
    contractAddress: "0xYourDeployedContractAddress", // Replace with actual address
    networkId: 10143,
    networkName: "Monad Testnet"
  }
};
```

### 4. For Testing Without Contract

If you want to test the UI without deploying:

```javascript
// In contract-config.js, temporarily use a placeholder
contractAddress: "0x1234567890123456789012345678901234567890", // Test address
```

## Current Status

The frontend is now configured to:
- ✅ Handle missing contract addresses gracefully
- ✅ Show clear error messages
- ✅ Prevent crashes when contract is not deployed
- ✅ Use fallback configuration

## Next Steps

1. **Deploy Contract**: Use Hardhat to deploy `SecureMonsweeper.sol`
2. **Update Config**: Set the real contract address
3. **Test**: Start the frontend and test wallet connections

## Error Resolution

### "Cannot redefine property: ethereum"
This is a wallet provider conflict. Try:
- Refresh the page
- Disable other wallet extensions temporarily
- Use incognito mode

### "Connection failed"
- Check if Monad testnet RPC is accessible
- Verify network settings in MetaMask
- Try different RPC endpoints

### "Game start failed"
- Ensure contract is deployed
- Check if contract address is correct
- Verify wallet has sufficient MON tokens

## Security Notes

Remember: The current implementation still has the security vulnerabilities we discussed. The server-side entropy fix requires:
1. Deploying the updated contract with server seed functionality
2. Implementing proper seed combination logic
3. Adding proper error handling for contract interactions

For production use, implement the full security fixes including Chainlink VRF or proper server-side entropy generation. 