const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying SecureMonsweeper contract...");

  // Get the contract factory
  const SecureMonsweeper = await ethers.getContractFactory("SecureMonsweeper");

  // Deploy the contract
  const secureMonsweeper = await SecureMonsweeper.deploy();
  await secureMonsweeper.deployed();

  console.log("SecureMonsweeper deployed to:", secureMonsweeper.address);
  console.log("Transaction hash:", secureMonsweeper.deployTransaction.hash);

  // Wait for a few block confirmations
  console.log("Waiting for block confirmations...");
  await secureMonsweeper.deployTransaction.wait(3);

  // Verify contract on explorer (if supported)
  try {
    console.log("Verifying contract on explorer...");
    await hre.run("verify:verify", {
      address: secureMonsweeper.address,
      constructorArguments: [],
    });
    console.log("Contract verified successfully");
  } catch (error) {
    console.log("Contract verification failed:", error.message);
  }

  // Save deployment info
  const deploymentInfo = {
    address: secureMonsweeper.address,
    network: hre.network.name,
    deployer: (await ethers.getSigners())[0].address,
    timestamp: new Date().toISOString(),
    blockNumber: await ethers.provider.getBlockNumber(),
  };

  console.log("\n=== Deployment Summary ===");
  console.log("Contract Address:", deploymentInfo.address);
  console.log("Network:", deploymentInfo.network);
  console.log("Deployer:", deploymentInfo.deployer);
  console.log("Block Number:", deploymentInfo.blockNumber);
  console.log("Timestamp:", deploymentInfo.timestamp);

  console.log("\n=== Next Steps ===");
  console.log("1. Update your .env file:");
  console.log(`   VITE_CONTRACT_ADDRESS=${deploymentInfo.address}`);
  console.log("2. Or update contract-config.js:");
  console.log(`   contractAddress: "${deploymentInfo.address}"`);
  console.log("3. Restart your frontend development server");
  console.log("4. Test the game functionality");

  return deploymentInfo;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 