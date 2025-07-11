// Server Entropy Verification Script
// Usage: node entropy-check.js <gameId1> <gameId2> <gameId3> ...

const { ethers } = require('ethers');

const CONTRACT_ADDRESS = '0x67B39F6bf2DCCaA5Cc5700c6887890c1629db532';
const RPC_URL = 'https://testnet-rpc.monad.xyz';

const ABI = [
  {
    "type": "function",
    "name": "getGameInfo",
    "inputs": [{"name": "gameId", "type": "bytes32"}],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "components": [
          {"name": "player", "type": "address"},
          {"name": "bet", "type": "uint256"},
          {"name": "active", "type": "bool"},
          {"name": "commitmentHash", "type": "bytes32"},
          {"name": "difficulty", "type": "uint8"},
          {"name": "startTimestamp", "type": "uint256"},
          {"name": "serverSeed", "type": "bytes32"},
          {"name": "serverSeedRevealed", "type": "bool"}
        ]
      }
    ],
    "stateMutability": "view"
  }
];

async function verifyServerEntropy(gameIds) {
  console.log('🔒 VERIFYING SERVER ENTROPY...\n');
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
  
  const serverSeeds = [];
  const results = [];
  
  for (const gameId of gameIds) {
    try {
      const gameInfo = await contract.getGameInfo(gameId);
      
      const result = {
        gameId: gameId,
        serverSeed: gameInfo.serverSeed,
        player: gameInfo.player,
        timestamp: new Date(Number(gameInfo.startTimestamp) * 1000).toISOString(),
        active: gameInfo.active,
        difficulty: gameInfo.difficulty === 0 ? 'Standard' : 'Critical'
      };
      
      results.push(result);
      serverSeeds.push(gameInfo.serverSeed);
      
      console.log(`🎯 Game: ${gameId}`);
      console.log(`   Server Seed: ${gameInfo.serverSeed}`);
      console.log(`   Player: ${gameInfo.player}`);
      console.log(`   Time: ${result.timestamp}`);
      console.log(`   Difficulty: ${result.difficulty}`);
      console.log('');
      
    } catch (error) {
      console.error(`❌ Error checking game ${gameId}:`, error.message);
    }
  }
  
  // Analyze entropy quality
  const uniqueSeeds = new Set(serverSeeds);
  const totalSeeds = serverSeeds.length;
  
  console.log('📊 ENTROPY ANALYSIS:');
  console.log(`   Total Games: ${totalSeeds}`);
  console.log(`   Unique Server Seeds: ${uniqueSeeds.size}`);
  console.log(`   Entropy Quality: ${uniqueSeeds.size === totalSeeds ? '✅ EXCELLENT' : '⚠️ NEEDS REVIEW'}`);
  
  if (uniqueSeeds.size === totalSeeds) {
    console.log('🎉 Server entropy is working perfectly!');
  } else {
    console.log('⚠️ Some server seeds are duplicated - this should be investigated');
  }
  
  return results;
}

// Command line usage
const gameIds = process.argv.slice(2);
if (gameIds.length === 0) {
  console.log('Usage: node entropy-check.js <gameId1> <gameId2> <gameId3> ...');
  console.log('Example: node entropy-check.js 0x1234567890abcdef... 0xabcdef1234567890...');
  process.exit(1);
}

verifyServerEntropy(gameIds).catch(console.error); 