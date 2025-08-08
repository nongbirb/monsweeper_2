# Migration Guide: From Privy to Reown AppKit

## Overview
This guide helps you migrate from Privy to Reown AppKit for your Monsweeper game. Reown is subsidized for Monad testnet usage and doesn't have user limits like Privy.

## Step 1: Get Your Reown Project ID

1. Go to [https://cloud.reown.com](https://cloud.reown.com)
2. Create a free account or sign in
3. Create a new project
4. Copy your Project ID from the dashboard

## Step 2: Install Dependencies

```bash
npm install @reown/appkit @reown/appkit-adapter-ethers @reown/appkit-adapter-wagmi @wagmi/core @wagmi/connectors wagmi
npm uninstall @privy-io/react-auth
```

## Step 3: Set Up Environment Variables

Create a `.env` file in your frontend directory:

```env
# Reown AppKit Configuration
VITE_REOWN_PROJECT_ID=your-actual-project-id-here

# Contract Configuration
VITE_CONTRACT_ADDRESS=0x1e0B2A54460a6b061EC987646Be5526fEfe6e4CA

# Optional: For development/testing
NODE_ENV=development
```

## Step 4: Update Your Domain Configuration

In your Reown Cloud dashboard:
1. Go to your project settings
2. Add your domain(s) to the allowed origins:
   - `http://localhost:5173` (for development)
   - `https://yourdomain.com` (for production)

## Step 5: Test the Migration

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Test wallet connection:
   - Click "Connect Wallet"
   - Try connecting with different wallets (MetaMask, WalletConnect, etc.)
   - Verify you can switch to Monad Testnet

3. Test game functionality:
   - Start a game
   - Play a few rounds
   - Check that transactions work properly

## Key Changes Made

### Authentication
- **Before (Privy)**: `usePrivy()` hook with `user`, `authenticated`, `login`, `logout`
- **After (Reown)**: `useAppKitAccount()` and `useAppKit()` hooks with `address`, `isConnected`, `open()`

### Wallet Provider
- **Before (Privy)**: Complex provider detection logic
- **After (Reown)**: Simple `useAppKitProvider('eip155')` hook

### UI Components
- **Before (Privy)**: Custom login/logout buttons
- **After (Reown)**: Built-in `<w3m-button />` component + custom connect button

## Benefits of Reown

1. **No User Limits**: Unlike Privy's 150 user limit
2. **Better Wallet Support**: More wallet options out of the box
3. **Subsidized for Monad**: Free tier is more generous
4. **Better UX**: Built-in wallet connection modal
5. **More Reliable**: Industry-standard wallet connection

## Troubleshooting

### Common Issues

1. **"Project ID not found"**
   - Check your `.env` file
   - Verify the Project ID is correct
   - Make sure you're using `VITE_REOWN_PROJECT_ID`

2. **"Domain not allowed"**
   - Add your domain to Reown Cloud settings
   - Include both `http://localhost:5173` and your production domain

3. **Chain not switching**
   - The migration includes automatic chain switching
   - Users will be prompted to add/switch to Monad Testnet

4. **Wallet connection issues**
   - Clear browser cache
   - Try different wallets
   - Check browser console for errors

### Support

- **Reown Documentation**: [https://docs.reown.com](https://docs.reown.com)
- **Reown Discord**: [https://discord.gg/reown](https://discord.gg/reown)
- **Monad Documentation**: [https://docs.monad.xyz](https://docs.monad.xyz)

## Testing Checklist

- [ ] Wallet connection works
- [ ] Chain switching to Monad Testnet works
- [ ] Game starts successfully
- [ ] Transactions are sent and confirmed
- [ ] Player stats are fetched correctly
- [ ] Game ending works properly
- [ ] Multiple wallet types work (MetaMask, WalletConnect, etc.)

## Next Steps

1. Update your `.env` file with the actual Project ID
2. Test thoroughly in development
3. Deploy to production
4. Monitor for any issues
5. Enjoy unlimited users! 🎉

---

**Note**: This migration maintains all existing game functionality while removing Privy's user limits and providing better wallet support. 