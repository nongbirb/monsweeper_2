// Transaction Data Analysis - What's Available to Attackers
const transactionData = {
  blockNumber: "25658920",
  blockHash: "0x7f34fb8bee62e3c3c0b63e9d7b13dbe234fff4483561200a8dc4935f0fa1e8bc",
  timestamp: "1752183218",
  from: "0x9d2aa2571da4fb680ecced0f18192a90d9757952", // msg.sender
  to: "0xd51f5ea400d979768c662a880ca62d0dfc87e2df",   // contract address
  value: "250000000000000000",                          // bet amount
  gameId: "0x2aef0d814adc1b59374716d523ba3a9308a2ffbce5c26ae5acd109e31ef21946"
};

// What an attacker can reconstruct:
async function analyzeServerSeedVulnerability() {
  console.log("🔍 ANALYZING SERVER SEED VULNERABILITY...\n");
  
  // 1. Block timestamp - EASILY AVAILABLE
  const blockTimestamp = transactionData.timestamp;
  console.log("✅ block.timestamp:", blockTimestamp);
  
  // 2. msg.sender - EASILY AVAILABLE  
  const msgSender = transactionData.from;
  console.log("✅ msg.sender:", msgSender);
  
  // 3. gameId - AVAILABLE from transaction return/events
  const gameId = transactionData.gameId;
  console.log("✅ gameId:", gameId);
  
  // 4. block.prevrandao - AVAILABLE from block data
  console.log("✅ block.prevrandao: [Can be fetched from block data]");
  
  // 5. Contract balance - THE TRICKY ONE
  console.log("⚠️  address(this).balance: [Reconstructable but complex]");
  
  console.log("\n🚨 VULNERABILITY ASSESSMENT:");
  console.log("- Server seed components are largely visible/reconstructable");
  console.log("- An attacker COULD potentially recreate the server seed");
  console.log("- This would compromise the randomness generation");
  
  return {
    vulnerability: "HIGH",
    recommendation: "Implement additional security measures"
  };
}

// Example of how attacker might reconstruct server seed
async function reconstructServerSeed(blockNumber, contractAddress) {
  console.log("\n🔴 POTENTIAL ATTACK VECTOR:");
  
  // Step 1: Get block data
  console.log("1. Fetch block data for prevrandao and timestamp");
  
  // Step 2: Get transaction details
  console.log("2. Extract msg.sender and gameId from transaction");
  
  // Step 3: Calculate contract balance at that moment
  console.log("3. Calculate contract balance:");
  console.log("   - Get balance before transaction");
  console.log("   - Add the bet amount sent in transaction");
  console.log("   - This gives balance at serverSeed generation time");
  
  // Step 4: Reconstruct server seed
  console.log("4. Reconstruct server seed using same formula");
  
  // Step 5: Calculate bomb positions
  console.log("5. Calculate bomb positions from reconstructed seed");
  
  console.log("\n💀 ATTACK RESULT: Full game state compromise");
}

analyzeServerSeedVulnerability();
reconstructServerSeed(); 