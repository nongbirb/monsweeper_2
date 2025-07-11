const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying MockEntropy contract...");

  // Get the contract factory
  const MockEntropy = await ethers.getContractFactory("MockEntropy");

  // Deploy the contract
  const mockEntropy = await MockEntropy.deploy();

  // Wait for deployment to complete
  await mockEntropy.waitForDeployment();

  const address = await mockEntropy.getAddress();
  console.log("MockEntropy deployed to:", address);

  // Verify the contract works
  console.log("Testing MockEntropy...");
  
  // Test getFee function
  const fee = await mockEntropy.getFee(ethers.ZeroAddress);
  console.log("Entropy fee:", ethers.formatEther(fee), "ETH");

  // Test initial state
  const currentSequence = await mockEntropy.currentSequenceNumber();
  console.log("Current sequence number:", currentSequence.toString());

  const pendingCount = await mockEntropy.getPendingRequestCount();
  console.log("Pending requests:", pendingCount.toString());

  console.log("\n=== MockEntropy Deployment Complete ===");
  console.log("Contract Address:", address);
  console.log("Fee per request:", ethers.formatEther(fee), "ETH");
  console.log("Fulfillment delay: 5 seconds");
  
  console.log("\n=== Next Steps ===");
  console.log("1. Update your SecureMonsweeper contract constructor with this address");
  console.log("2. Use this address as the entropy provider as well");
  console.log("3. The mock will auto-fulfill entropy requests after 5 seconds");
  console.log("4. Call autoFulfillPendingRequests() to manually trigger fulfillment");

  return address;
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then((address) => {
    console.log("\nDeployment successful!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  }); 