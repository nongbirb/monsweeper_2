import { useState, useEffect, useRef, useMemo } from 'react';
import { useAppKit, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { createWalletClient, createPublicClient, custom, http, parseGwei } from 'viem';
import { ethers } from 'ethers';
import './App.css';
import { getContractAddress } from '../contract-config.js';
const contractAddress = getContractAddress();
const MONAD_TESTNET = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
};
// Updated ABI to match the simplified contract - JSON format for viem compatibility
const abi = [
  {
    "type": "function",
    "name": "startGame",
    "inputs": [
      {"name": "difficulty", "type": "uint8"},
      {"name": "commitmentHash", "type": "bytes32"}
    ],
    "outputs": [{"name": "", "type": "bytes32"}],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "endGame",
    "inputs": [
      {"name": "gameId", "type": "bytes32"},
      {"name": "clientSeed", "type": "bytes32"},
      {"name": "won", "type": "bool"},
      {"name": "tilesRevealed", "type": "uint8"}
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "forfeitGame",
    "inputs": [{"name": "gameId", "type": "bytes32"}],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
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
          {"name": "serverSeedRevealed", "type": "bool"},
          {"name": "blockNumber", "type": "uint256"},
          {"name": "futureBlockHash", "type": "bytes32"},
          {"name": "nonce", "type": "uint256"}
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPlayerActiveGame",
    "inputs": [{"name": "player", "type": "address"}],
    "outputs": [{"name": "", "type": "bytes32"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getServerSeed",
    "inputs": [{"name": "gameId", "type": "bytes32"}],
    "outputs": [{"name": "", "type": "bytes32"}],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "GameStarted",
    "inputs": [
      {"name": "gameId", "type": "bytes32", "indexed": true},
      {"name": "player", "type": "address", "indexed": true},
      {"name": "bet", "type": "uint256", "indexed": false},
      {"name": "difficulty", "type": "uint8", "indexed": false},
      {"name": "commitmentHash", "type": "bytes32", "indexed": false}
    ]
  },
  {
    "type": "event",
    "name": "GameEnded",
    "inputs": [
      {"name": "gameId", "type": "bytes32", "indexed": true},
      {"name": "player", "type": "address", "indexed": true},
      {"name": "bet", "type": "uint256", "indexed": false},
      {"name": "payout", "type": "uint256", "indexed": false},
      {"name": "won", "type": "bool", "indexed": false},
      {"name": "tilesRevealed", "type": "uint8", "indexed": false},
      {"name": "seed", "type": "bytes32", "indexed": false}
    ]
  },
  {
    "type": "event",
    "name": "GameForfeited",
    "inputs": [
      {"name": "gameId", "type": "bytes32", "indexed": true},
      {"name": "player", "type": "address", "indexed": true}
    ]
  },
  {
    "type": "function",
    "name": "shouldForceCashout",
    "inputs": [
      {"name": "gameId", "type": "bytes32"},
      {"name": "tilesRevealed", "type": "uint8"}
    ],
    "outputs": [
      {"name": "", "type": "bool"},
      {"name": "", "type": "uint256"}
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "calculateCurrentPayout",
    "inputs": [
      {"name": "gameId", "type": "bytes32"},
      {"name": "tilesRevealed", "type": "uint8"}
    ],
    "outputs": [
      {"name": "", "type": "uint256"}
    ],
    "stateMutability": "view"
  }
];

// Crypto utilities for client-side logic
function generateGameSeed() {
  return ethers.hexlify(ethers.randomBytes(32));
}

function createCommitmentHash(difficulty, seed) {
  const difficultyStr = difficulty === 0 ? "normal" : "god_of_war";
  // The seed from ethers.js includes a "0x" prefix. The contract's hashing
  // function constructs the hex string WITHOUT the "0x" prefix.
  // We must remove it here to ensure the client and contract hashes match.
  const seedForHashing = seed.substring(2);
  const gameData = JSON.stringify({
    version: "ultra-v1",
    difficulty: difficultyStr,
    seed: seedForHashing,
  });
  return ethers.keccak256(ethers.toUtf8Bytes(gameData));
}


// Game logic utilities
function generateBombPositions(seed, difficulty) {
  const numBombs = difficulty === 1 ? 12 : 9;
  const bombPositions = new Array(36).fill(false);
  
  let bombsPlaced = 0;
  for (let i = 0; bombsPlaced < numBombs; i++) {
    const positionHash = ethers.keccak256(ethers.concat([
      ethers.toBeArray(seed),
      ethers.toBeArray(i)
    ]));
    const position = parseInt(positionHash.slice(-2), 16) % 36;
    
    if (!bombPositions[position]) {
      bombPositions[position] = true;
      bombsPlaced++;
    }
  }
  
  return bombPositions;
}
function calculateMultiplier(safeRevealed, numBombs) {
  if (safeRevealed === 0) return 0;
  
  // Safety check to prevent invalid parameters
  if (safeRevealed > 36 - numBombs) return 0;
  
  // Apply pure DF formula: Multiplier = ∏(i=0 to S-1) (T/(T-B-i))
  // where T = 36, B = numBombs, S = safeRevealed
  let multiplier = 1.0;
  
  // Calculate using the actual bomb count for each mode
  for (let i = 0; i < safeRevealed; i++) {
    const denominator = 36 - numBombs - i;
    
    // Safety check for division by zero
    if (denominator <= 0) return 0;
    
    // T/(T-B-i) = 36/(36-numBombs-i)
    multiplier *= 36 / denominator;
    
          // Cap multiplier at 500k to prevent overflow (matches contract)
            if (multiplier > 500_000) {
          multiplier = 500_000;
      break;
    }
  }
  
  // Apply 5% house edge (multiply by 0.95)
  multiplier *= 0.95;
  
  return multiplier;
}
function useTransaction() {
  const { address, isConnected, chainId } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider('eip155');
  const walletClient = useRef(null);
  const publicClient = useRef(null);
  const [isWalletReady, setIsWalletReady] = useState(false);
  
  const switchToMonadTestnet = async (provider) => {
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${MONAD_TESTNET.id.toString(16)}` }],
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        try {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: `0x${MONAD_TESTNET.id.toString(16)}`,
                chainName: MONAD_TESTNET.name,
                nativeCurrency: MONAD_TESTNET.nativeCurrency,
                rpcUrls: MONAD_TESTNET.rpcUrls.default.http,
                blockExplorerUrls: ['https://testnet-explorer.monad.xyz'],
              },
            ],
          });
        } catch (addError) {
          console.error('Failed to add Monad Testnet:', addError);
          throw addError;
        }
      } else {
        console.error('Failed to switch to Monad Testnet:', switchError);
        throw switchError;
      }
    }
  };
  
  useEffect(() => {
    async function initWalletClient() {
      if (!isConnected || !address || !walletProvider) {
        walletClient.current = null;
        publicClient.current = null;
        setIsWalletReady(false);
        return;
      }
      try {
        publicClient.current = createPublicClient({
          chain: MONAD_TESTNET,
          transport: http()
        });
        
        // Switch to Monad Testnet if not already connected
        if (chainId !== MONAD_TESTNET.id) {
          await switchToMonadTestnet(walletProvider);
        }
        
        walletClient.current = createWalletClient({
          chain: MONAD_TESTNET,
          transport: custom(walletProvider),
          account: address
        });
        setIsWalletReady(true);
      } catch (error) {
        console.error("Failed to initialize wallet client:", error);
        walletClient.current = null;
        publicClient.current = null;
        setIsWalletReady(false);
      }
    }
    initWalletClient();
  }, [address, isConnected, chainId, walletProvider]);
  async function sendTransactionAndConfirm({ to, data, gas, value = 0 }) {
    try {
      if (!walletClient.current || !publicClient.current) {
        throw new Error("Wallet client not initialized.");
      }
      if (!address) {
        throw new Error("User wallet address not available.");
      }
      const txHash = await walletClient.current.sendTransaction({
        to,
        account: address,
        data,
        gas: BigInt(gas),
        value: BigInt(value),
        maxFeePerGas: parseGwei('50'),
        maxPriorityFeePerGas: parseGwei('2'),
      });
      return txHash;
    } catch (error) {
      console.error("Error in sendTransactionAndConfirm:", error);
      throw error;
    }
  }
  return { walletClient, publicClient, sendTransactionAndConfirm, isWalletReady };
}
function App() {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { walletClient, publicClient, sendTransactionAndConfirm, isWalletReady } = useTransaction();
  // Game state
  const [gameId, setGameId] = useState(null);
  const [gameActive, setGameActive] = useState(false);
  const [gameCommitmentHash, setGameCommitmentHash] = useState(null);
  const [gameSeed, setGameSeed] = useState(null);
  const [tiles, setTiles] = useState(Array(36).fill(0)); // 0: unrevealed, 1: safe, 2: bomb
  const [revealedTiles, setRevealedTiles] = useState(Array(36).fill(false));
  const [clickedTileSequence, setClickedTileSequence] = useState([]);
  const [bombPositions, setBombPositions] = useState(Array(36).fill(false));
  const [difficulty, setDifficulty] = useState(0); // 0 = NORMAL, 1 = GOD_OF_WAR
  const [selectedBet, setSelectedBet] = useState("0.25");
  const [status, setStatus] = useState("Awaiting command, Executor.");
  const [gameError, setGameError] = useState(false);
  const [gameErrorText, setGameErrorText] = useState("");
  const [isTransactionPending, setIsTransactionPending] = useState(false);
  const [gameEndedWithBomb, setGameEndedWithBomb] = useState(false);
  const [totalEarned, setTotalEarned] = useState(0);
  const [totalLost, setTotalLost] = useState(0);
  const [houseBalance, setHouseBalance] = useState(0);
  const [payoutLimitReached, setPayoutLimitReached] = useState(false);
  // Explosion animation state
  const [explodingTile, setExplodingTile] = useState(null);
  const [explosionStage, setExplosionStage] = useState(0); // 0: normal, 1: expanding, 2: boom, 3: fade
  const [showFullScreenExplosion, setShowFullScreenExplosion] = useState(false);
  
  // Eric image state for orbit dots
  const [ericDotIndex, setEricDotIndex] = useState(null); // null means no Eric, 0-9 for dot index
  const [ericTransitioning, setEricTransitioning] = useState(false);
  
  const contractInterface = useMemo(() => new ethers.Interface(abi), []);

  useEffect(() => {
    const fetchPlayerStats = async () => {
      // We only want to fetch stats when the wallet is connected and ready.
      if (!isWalletReady || !publicClient.current || !address) return;

      try {
        const allLogs = [];
        const latestBlock = await publicClient.current.getBlockNumber();
        const blockRange = 100n; 
        
        for (let fromBlock = 0n; fromBlock <= latestBlock; fromBlock += blockRange) {
          const toBlock = fromBlock + blockRange - 1n > latestBlock ? latestBlock : fromBlock + blockRange - 1n;
          
          const logs = await publicClient.current.getLogs({
            address: contractAddress,
            event: contractInterface.getEvent('GameEnded'),
            args: {
              player: address,
            },
            fromBlock,
            toBlock
          });
          allLogs.push(...logs.map(log => contractInterface.parseLog(log)));
        }

        let earned = 0;
        let lost = 0;

        for (const log of allLogs) {
          if (log.args.won) {
            earned += parseFloat(ethers.formatEther(log.args.payout));
          } else {
            lost += parseFloat(ethers.formatEther(log.args.bet));
          }
        }
        
        setTotalEarned(earned);
        setTotalLost(lost);

      } catch (error) {
        console.error("Failed to fetch player stats:", error);
      }
    };

    fetchPlayerStats();
  }, [isWalletReady, address]);

  useEffect(() => {
    // Generate a new seed and commitment hash whenever the difficulty changes,
    // but only if a game is not currently active.
    if (gameActive) return;

    const seed = generateGameSeed();
    setGameSeed(seed);
    const commitmentHash = createCommitmentHash(difficulty, seed);
    setGameCommitmentHash(commitmentHash);
  }, [gameActive, difficulty]);

  useEffect(() => {
    const fetchHouseBalance = async () => {
      if (publicClient.current) {
        try {
          const balance = await publicClient.current.getBalance({ address: contractAddress });
          setHouseBalance(parseFloat(ethers.formatEther(balance)));
        } catch (error) {
          console.error("Failed to fetch house balance:", error);
        }
      }
    };

    fetchHouseBalance();
    // Fetch intermittently to keep it updated
    const interval = setInterval(fetchHouseBalance, 10000);
    return () => clearInterval(interval);
  }, [publicClient.current]);

  useEffect(() => {
    if (!isConnected) {
      setStatus("Awaiting connection to Psionic Matrix.");
    } else if (!isWalletReady) {
      setStatus("Calibrating warp drives...");
    } else if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
      setStatus("⚠️ Contract not deployed. Please deploy SecureMonsweeper.sol first.");
    } else {
      setStatus("Nexus online. Awaiting command.");
    }
  }, [isConnected, isWalletReady]);

  // Eric image random switching effect
  useEffect(() => {
    // Start Eric animation after 3 seconds
    const startDelay = setTimeout(() => {
      const randomDot = Math.floor(Math.random() * 10);
      setEricDotIndex(randomDot);
    }, 3000);
    
    const ericInterval = setInterval(() => {
      if (ericTransitioning) {
        return;
      }
      
      setEricTransitioning(true);
      
      if (ericDotIndex === null) {
        // Show Eric on a random dot (0-9 for 10 dots total)
        const randomDotIndex = Math.floor(Math.random() * 10);
        setEricDotIndex(randomDotIndex);
      } else {
        // Hide Eric
        setEricDotIndex(null);
      }
      
      // Reset transitioning state after animation completes
      setTimeout(() => {
        setEricTransitioning(false);
      }, 600); // Match CSS transition duration + buffer
      
    }, 4000); // Fixed 4 second interval for easier debugging
    
    return () => {
      clearTimeout(startDelay);
      clearInterval(ericInterval);
    };
  }, [ericDotIndex, ericTransitioning]);

  // Start game
  const handleStartGame = async () => {
    try {
      setGameError(false);
      setGameErrorText("");
      setIsTransactionPending(true);
      if (!isConnected || !address) {
        setStatus("Psionic link not established. Connect your wallet.");
        return;
      }
      if (!isWalletReady || !walletClient.current || !publicClient.current) {
        setStatus("Wallet not synchronized. Please wait or refresh.");
        return;
      }
      if (!gameSeed || !gameCommitmentHash) {
        setStatus("Cannot generate commitment. Please select a difficulty.");
        return;
      }
      if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
        setStatus("Contract address not configured. Please set VITE_CONTRACT_ADDRESS.");
        return;
      }
      setStatus("Warp field stabilizing...");
      const betValue = ethers.parseEther(selectedBet);
      const data = contractInterface.encodeFunctionData("startGame", [difficulty, gameCommitmentHash]);
      
      const txHash = await sendTransactionAndConfirm({
        to: contractAddress,
        data,
        gas: 500000,
        value: betValue,
      });

      setStatus(`Receiving coordinates... ${txHash.slice(0, 10)}...`);
      const receipt = await publicClient.current.waitForTransactionReceipt({ hash: txHash });
      
      const parsedLogs = receipt.logs
        .map(log => {
          try {
            return contractInterface.parseLog(log);
          } catch (e) {
            return null;
          }
        })
        .filter(log => log !== null);
      
      const gameStartedEvent = parsedLogs.find(e => e.name === "GameStarted");
      if (!gameStartedEvent) {
        throw new Error("GameStarted event not found in transaction receipt.");
      }
      
      const receivedGameId = gameStartedEvent.args.gameId;
      
      // Fetch game info to get server seed for secure combined seed generation
      try {
        const gameInfo = await publicClient.current.readContract({
          address: contractAddress,
          abi: abi,
          functionName: 'getGameInfo',
          args: [receivedGameId]
        });
        
        // Combine client and server seeds for security
        const serverSeed = gameInfo.serverSeed;
        const combinedSeed = ethers.keccak256(ethers.concat([
          ethers.toBeArray(gameSeed),
          ethers.toBeArray(serverSeed)
        ]));
        
        // 🔒 SECURITY: Store seeds but don't log them until game ends
        window.gameSecurityInfo = {
          clientSeed: gameSeed,
          serverSeed: serverSeed,
          combinedSeed: combinedSeed,
          nonce: gameInfo.nonce,
          blockNumber: gameInfo.blockNumber,
          futureBlockHash: gameInfo.futureBlockHash,
          revealedAt: null
        };
        
        console.log("🔒 Game started with ENHANCED entropy - seeds will be revealed after game ends");
        
        setGameId(receivedGameId);
        setGameActive(true);
        setTiles(Array(36).fill(0));
        setRevealedTiles(Array(36).fill(false));
        setClickedTileSequence([]);
        setBombPositions(generateBombPositions(combinedSeed, difficulty));
        setGameEndedWithBomb(false);
        setPayoutLimitReached(false);
      } catch (error) {
        console.warn("Could not fetch server seed, using client seed only:", error);
        // Fallback to client seed only for development/testing
        setGameId(receivedGameId);
        setGameActive(true);
        setTiles(Array(36).fill(0));
        setRevealedTiles(Array(36).fill(false));
        setClickedTileSequence([]);
        setBombPositions(generateBombPositions(gameSeed, difficulty));
        setGameEndedWithBomb(false);
        setPayoutLimitReached(false);
      }
      setTotalLost(prev => prev + parseFloat(selectedBet));
      setStatus("Game started! Click on the tiles.");

    } catch (err) {
      console.error("Error starting game:", err);
      setGameError(true);
      setGameErrorText(err.message);
      setStatus(`Warp-in failed: ${err.message}`);
    } finally {
      setIsTransactionPending(false);
    }
  };
  // Handle tile click (frontend logic)
  const handleTileClick = (pos) => {
    if (!gameActive || revealedTiles[pos] || isTransactionPending || payoutLimitReached) return;
    
    // Check if the next click would force cashout using client-side calculation
    if (gameId && gameActive) {
      const nextTilesRevealed = clickedTileSequence.length + 1;
      const numBombs = difficulty === 1 ? 12 : 9;
      const nextMultiplier = calculateMultiplier(nextTilesRevealed, numBombs);
      
      // Calculate payout (house edge already applied in calculateMultiplier)
      const betInWei = ethers.parseEther(selectedBet);
      
              // Calculate payout with overflow protection
        let nextPayout;
        try {
          // Cap multiplier to prevent extreme calculations (matches contract cap)
          const cappedMultiplier = Math.min(nextMultiplier, 500_000); // Cap at 500k to match contract
          nextPayout = betInWei * BigInt(Math.floor(cappedMultiplier * 1000)) / 1000n;
        } catch (error) {
          console.warn("Payout calculation failed, using conservative estimate:", error);
          // Use conservative fallback for safety
          nextPayout = betInWei * BigInt(Math.min(Math.floor(nextMultiplier), 1000));
        }
      
      // Check if payout would exceed 20% of house balance
      const houseBalanceInWei = ethers.parseEther(houseBalance.toString());
      const currentBetInWei = ethers.parseEther(selectedBet);
      
      // Calculate available balance (prevent underflow like in contract)
      const availableBalance = houseBalanceInWei >= currentBetInWei 
        ? houseBalanceInWei - currentBetInWei 
        : 0n;
      const maxAllowedPayout = availableBalance * 20n / 100n;
      
      if (houseBalance > 0 && nextPayout > maxAllowedPayout) {
        setPayoutLimitReached(true);
        setStatus(`🚨 PAYOUT LIMIT REACHED! Maximum payout of ${ethers.formatEther(maxAllowedPayout)} MON available. Cash out now to claim your winnings!`);
        return; // Don't allow the tile click
      }
    }
    
    if (bombPositions[pos]) {
      // Immediately disable game to prevent race condition
      setGameActive(false);
      
      // Start full-screen explosion animation sequence
      setExplodingTile(pos);
      setShowFullScreenExplosion(true);
      setExplosionStage(1); // Start expanding
      setStatus("Hostile detected! GAME OVER!");

      // Stage 1: Expansion (0-500ms)
      setTimeout(() => setExplosionStage(2), 500); // Boom stage
      
      // Stage 2: Boom effect (500-1300ms)
      setTimeout(() => setExplosionStage(3), 1300); // Fade stage
      
      // Stage 3: Reveal all bombs and end game (1300-1900ms)
      setTimeout(() => {
        const newTiles = [...tiles];
        const newRevealed = [...revealedTiles];
        bombPositions.forEach((isBomb, index) => {
          if (isBomb) {
            newTiles[index] = 2; // Bomb
            newRevealed[index] = true;
          }
        });
        clickedTileSequence.forEach(tileIndex => {
          if (!bombPositions[tileIndex]) {
            newTiles[tileIndex] = 1; // Safe
            newRevealed[tileIndex] = true;
          }
        });
        setTiles(newTiles);
        setRevealedTiles(newRevealed);
        setGameEndedWithBomb(true);
        
        // Reset explosion state
        setExplodingTile(null);
        setExplosionStage(0);
        setShowFullScreenExplosion(false);
      }, 1900);
      
      return;
    }

    const newSequence = [...clickedTileSequence, pos];
    setClickedTileSequence(newSequence);
    const newRevealed = [...revealedTiles];
    newRevealed[pos] = true;
    setRevealedTiles(newRevealed);
    const newTiles = [...tiles];
    newTiles[pos] = 1; // Safe
    setTiles(newTiles);
    setStatus(`Sector ${pos + 1} clear. ${newSequence.length} sectors mapped.`);
  };

  const handleCashOut = async () => {
    if (!gameActive || clickedTileSequence.length === 0 || isTransactionPending) {
      setStatus("Recall signal blocked.");
      return;
    }
    await handleEndGame(true);
   };

  const handleEndGame = async (won) => {
    if (!isWalletReady || !walletClient.current || !publicClient.current) {
      setStatus("Wallet not synchronized.");
      return;
    }
    try {
      setIsTransactionPending(true);
      setStatus(won ? "Executing..." : "Signal lost...");
      const data = contractInterface.encodeFunctionData("endGame", [
        gameId,
        gameSeed, // Send client seed
        won,
        clickedTileSequence.length,
      ]);
      const txHash = await sendTransactionAndConfirm({
        to: contractAddress,
        data,
        gas: 400000,
      });
      setStatus(`Awaiting confirmation from the Great Eye... ${txHash.slice(0, 10)}...`);
      const receipt = await publicClient.current.waitForTransactionReceipt({ hash: txHash });
      const parsedLogs = receipt.logs
         .map(log => {
           try {
             return contractInterface.parseLog(log);
           } catch (e) {
             return null;
           }
         })
         .filter(log => log !== null);
      const gameEndedEvent = parsedLogs.find(e => e.name === "GameEnded");

       if (gameEndedEvent) {
         const payout = parseFloat(ethers.formatEther(gameEndedEvent.args.payout));
         if (won) {
           setTotalEarned(prev => prev + payout);
           setStatus(`${payout.toFixed(4)} MON acquired. We await your next command.`);
         } else {
           setStatus("Probe destroyed. The Swarm is relentless.");
         }
       }
      
      // 🔒 SECURITY: Reveal seeds now that game is finished
      if (window.gameSecurityInfo) {
        window.gameSecurityInfo.revealedAt = new Date().toISOString();
        console.log("🔒 GAME FINISHED - REVEALING ENHANCED ENTROPY FOR VERIFICATION:");
        console.log("🎯 Client Seed:", window.gameSecurityInfo.clientSeed);
        console.log("🎯 Server Seed:", window.gameSecurityInfo.serverSeed);
        console.log("🎯 Combined Seed:", window.gameSecurityInfo.combinedSeed);
        console.log("🔒 ENHANCED ENTROPY SOURCES:");
        console.log("   📊 Game Nonce:", window.gameSecurityInfo.nonce);
        console.log("   🏗️ Block Number:", window.gameSecurityInfo.blockNumber);
        console.log("   🔮 Future Block Hash:", window.gameSecurityInfo.futureBlockHash);
        console.log("🔒 Enhanced server entropy worked! Each game has unique seeds.");
        console.log("🔒 Seeds revealed at:", window.gameSecurityInfo.revealedAt);
        console.log("🔒 Game was " + (won ? "WON" : "LOST"));
      }
      
      setGameActive(false);
      resetGame();
    } catch (err) {
      console.error("Error ending game:", err);
      setGameError(true);
      setGameErrorText(err.message);
      setStatus(`Recall failed: ${err.message}`);
    } finally {
      setIsTransactionPending(false);
    }
  };

  const resetGame = () => {
    setGameId(null);
    setClickedTileSequence([]);
    setTiles(Array(36).fill(0));
    setRevealedTiles(Array(36).fill(false));
    setBombPositions(Array(36).fill(false));
    setGameSeed(null);
    setGameCommitmentHash(null);
    setGameEndedWithBomb(false);
    setPayoutLimitReached(false);
    
    // Reset explosion animation state
    setExplodingTile(null);
    setExplosionStage(0);
    setShowFullScreenExplosion(false);
    
    // 🔒 SECURITY: Clear stored security info
    if (window.gameSecurityInfo) {
      delete window.gameSecurityInfo;
    }
  };

  // Forfeit game
  const handleForfeit = async () => {
    if (!gameActive || !gameId || isTransactionPending) return;
    try {
      setIsTransactionPending(true);
      setStatus("Aborting mission...");
      const data = contractInterface.encodeFunctionData("forfeitGame", [gameId]);
      const txHash = await sendTransactionAndConfirm({
        to: contractAddress,
        data,
        gas: 200000,
      });
      setStatus(`Processing tactical retreat... ${txHash.slice(0, 10)}...`);
      await publicClient.current.waitForTransactionReceipt({ hash: txHash });
      setStatus("Probe self-destructed. A necessary sacrifice.");
      
      // 🔒 SECURITY: Reveal seeds now that game is finished (forfeit)
      if (window.gameSecurityInfo) {
        window.gameSecurityInfo.revealedAt = new Date().toISOString();
        console.log("🔒 GAME FORFEITED - REVEALING ENHANCED ENTROPY FOR VERIFICATION:");
        console.log("🎯 Client Seed:", window.gameSecurityInfo.clientSeed);
        console.log("🎯 Server Seed:", window.gameSecurityInfo.serverSeed);
        console.log("🎯 Combined Seed:", window.gameSecurityInfo.combinedSeed);
        console.log("🔒 ENHANCED ENTROPY SOURCES:");
        console.log("   📊 Game Nonce:", window.gameSecurityInfo.nonce);
        console.log("   🏗️ Block Number:", window.gameSecurityInfo.blockNumber);
        console.log("   🔮 Future Block Hash:", window.gameSecurityInfo.futureBlockHash);
        console.log("🔒 Enhanced server entropy worked! Each game has unique seeds.");
        console.log("🔒 Seeds revealed at:", window.gameSecurityInfo.revealedAt);
        console.log("🔒 Game was FORFEITED");
      }
      
      setGameActive(false);
      resetGame();
    } catch (err) {
      console.error("Error forfeiting game:", err);
      setGameError(true);
      setGameErrorText(err.message);
      setStatus(`Retreat failed: ${err.message}`);
    } finally {
      setIsTransactionPending(false);
    }
  };
  const isGameControlsEnabled = isConnected && isWalletReady && !isTransactionPending;
  const numBombs = difficulty === 1 ? 12 : 9;
  const currentMultiplier = calculateMultiplier(clickedTileSequence.length, numBombs);
  const finalMultiplier = currentMultiplier; // House edge already applied in calculateMultiplier
  
  // Protect against overflow in display calculation
  const safeFinalMultiplier = Math.min(finalMultiplier, 1_000_000); // Cap at 1M for display
  const potentialWin = safeFinalMultiplier * parseFloat(selectedBet);
  
  // Function to render orbit dot or Eric image
  const renderOrbitDot = (dotIndex, animationClass, baseColor, shadowColor) => {
    const isEric = ericDotIndex === dotIndex;
    const shouldDim = ericDotIndex !== null && ericDotIndex !== dotIndex;
    
    return (
      <div className={`absolute ${animationClass}`}>
        {/* Normal dot */}
        <div 
          className={`orbit-dot w-4 h-4 rounded-full ${shouldDim ? 'dimmed' : ''}`}
          style={{ 
            backgroundColor: baseColor,
            boxShadow: `0 0 15px ${shadowColor}`,
            opacity: isEric ? 0 : 1,
            transition: 'opacity 0.5s ease-in-out, transform 0.5s ease-in-out',
            marginLeft: '-8px',
            marginTop: '-8px'
          }}
        />
        {/* Eric image */}
        <div
          className="orbit-eric"
          style={{
            marginLeft: '-16px',
            marginTop: '-16px',
            opacity: isEric ? 1 : 0,
            transform: isEric ? 'scale(1)' : 'scale(0.3)',
            transition: 'opacity 0.5s ease-in-out, transform 0.5s ease-in-out',
            display: 'block',
            backgroundImage: `url('/eric.png')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundColor: 'transparent'
          }}
        />
      </div>
    );
  };
  
  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Animated Monad Background */}
      <div className="absolute inset-0">
        {/* Grid Pattern */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `
            linear-gradient(rgba(0,255,255,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,255,0.3) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px'
        }}></div>
        
        {/* Animated Neon Gradients */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_50%,#00ffff22_0%,transparent_70%)] animate-pulse"></div>
          <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_80%_20%,#ff00ff22_0%,transparent_70%)] animate-pulse" style={{animationDelay: '1s'}}></div>
          <div className="absolute bottom-0 center w-full h-full bg-[radial-gradient(circle_at_50%_80%,#00ff0022_0%,transparent_70%)] animate-pulse" style={{animationDelay: '2s'}}></div>
        </div>
        
        {/* Monad Logo with Orbiting Dots - Screen Size */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-screen h-screen flex items-center justify-center" style={{ transform: 'translateX(-20%)' }}>
            {/* Premium Holographic Monad Logo */}
            <div className="premium-monad">
              {/* Quantum field distortion - deepest layer */}
              <div className="quantum-field"></div>
              
              {/* Holographic rotating background */}
              <div className="holographic-field"></div>
              
              {/* Volumetric lighting */}
              <div className="volumetric-light"></div>
              
              {/* Prismatic energy core */}
              <div className="prismatic-core"></div>
              
              {/* Advanced quantum particles */}
              <div className="quantum-particle particle-1"></div>
              <div className="quantum-particle particle-2"></div>
              <div className="quantum-particle particle-3"></div>
              <div className="quantum-particle particle-4"></div>
              <div className="quantum-particle particle-5"></div>
              <div className="quantum-particle particle-6"></div>
              
              {/* Dynamic energy rings */}
              <div className="energy-ring energy-ring-1"></div>
              <div className="energy-ring energy-ring-2"></div>
              <div className="energy-ring energy-ring-3"></div>
              <div className="energy-ring energy-ring-4"></div>
              
              {/* Glassmorphism backdrop */}
              <div className="glass-backdrop"></div>
              
              {/* Premium Monad Logo */}
              <img 
                src="https://monad-foundation.notion.site/image/https%3A%2F%2Fprod-files-secure.s3.us-west-2.amazonaws.com%2F8b536fe4-3bbf-45fc-b661-190b80c94bea%2Fc5c6a821-eed7-43e6-9a52-f32883fae734%2FMonad_Logo_-_Default_-_Logo_Mark.png?table=block&id=16863675-94f2-8005-a154-eea674b19e16&spaceId=8b536fe4-3bbf-45fc-b661-190b80c94bea&width=140&userId=&cache=v2"
                alt="Monad Logo"
                className="monad-premium"
              />
            </div>
            
            {/* Orbit 1 - Clockwise - Inner */}
            <div className="absolute w-96 h-96 flex items-center justify-center animate-orbit-1">
              <div className="absolute w-96 h-96 border border-[#836EF9]/25 rounded-full"></div>
              {renderOrbitDot(0, 'animate-orbit-dot-1', '#836EF9', '#836EF9')}
              {renderOrbitDot(1, 'animate-orbit-dot-1-offset', '#836EF9', '#836EF9')}
            </div>
            
            {/* Orbit 2 - Counterclockwise - Middle */}
            <div className="absolute w-[28rem] h-[28rem] flex items-center justify-center animate-orbit-2">
              <div className="absolute w-[28rem] h-[28rem] border border-[#200052]/25 rounded-full"></div>
              {renderOrbitDot(2, 'animate-orbit-dot-2', '#200052', '#200052')}
              {renderOrbitDot(3, 'animate-orbit-dot-2-offset', '#200052', '#200052')}
            </div>
            
            {/* Orbit 3 - Clockwise - Outer */}
            <div className="absolute w-[32rem] h-[32rem] flex items-center justify-center animate-orbit-3">
              <div className="absolute w-[32rem] h-[32rem] border border-[#A0055D]/25 rounded-full"></div>
              {renderOrbitDot(4, 'animate-orbit-dot-3', '#A0055D', '#A0055D')}
              {renderOrbitDot(5, 'animate-orbit-dot-3-offset', '#A0055D', '#A0055D')}
            </div>
            
            {/* Orbit 4 - Counterclockwise - Far */}
            <div className="absolute w-[36rem] h-[36rem] flex items-center justify-center animate-orbit-4">
              <div className="absolute w-[36rem] h-[36rem] border border-[#00FF7F]/25 rounded-full"></div>
              {renderOrbitDot(6, 'animate-orbit-dot-4', '#00FF7F', '#00FF7F')}
              {renderOrbitDot(7, 'animate-orbit-dot-4-offset', '#00FF7F', '#00FF7F')}
            </div>
            
            {/* Orbit 5 - Clockwise - Outermost */}
            <div className="absolute w-[40rem] h-[40rem] flex items-center justify-center animate-orbit-5">
              <div className="absolute w-[40rem] h-[40rem] border border-[#FF4500]/25 rounded-full"></div>
              {renderOrbitDot(8, 'animate-orbit-dot-5', '#FF4500', '#FF4500')}
              {renderOrbitDot(9, 'animate-orbit-dot-5-offset', '#FF4500', '#FF4500')}
            </div>
          </div>
        </div>
        
        {/* Scanning Lines */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute w-full h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-scan-line"></div>
        </div>
      </div>
      
      {/* Full-Screen Explosion Overlay */}
      {showFullScreenExplosion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none bg-black/20">
          {/* Explosion Particles */}
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 bg-orange-500 rounded-full animate-ping"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 2}s`,
                  animationDuration: `${0.5 + Math.random() * 1}s`
                }}
              />
            ))}
          </div>
          
          {/* Main Eric Image */}
          <img 
            src="/eric.png"
            alt="Eric Full Screen Explosion"
            className={`object-contain transition-all explosion-image-optimized
              ${explosionStage === 1 ? 'animate-[fullScreenExpand_500ms_forwards] animate-fullscreen-expand' : ''}
              ${explosionStage === 2 ? 'animate-[fullScreenBoom_800ms_forwards] animate-fullscreen-boom' : ''}
              ${explosionStage === 3 ? 'animate-[fullScreenFade_600ms_forwards] animate-fullscreen-fade' : ''}
            `}
            style={{
              width: explosionStage === 0 ? '100px' : 'auto',
              height: explosionStage === 0 ? '100px' : 'auto',
              aspectRatio: '1/1',
              filter: explosionStage >= 2 ? 'brightness(2) saturate(1.5) drop-shadow(0 0 50px rgba(255,100,100,1))' : 'brightness(1.2)',
            }}
          />
          
          {/* Explosion Ring Effect */}
          {explosionStage >= 2 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-32 h-32 border-4 border-orange-500 rounded-full animate-ping" style={{animationDuration: '1s'}}></div>
              <div className="absolute w-64 h-64 border-2 border-red-500 rounded-full animate-ping" style={{animationDuration: '1.5s', animationDelay: '0.2s'}}></div>
              <div className="absolute w-96 h-96 border border-yellow-500 rounded-full animate-ping" style={{animationDuration: '2s', animationDelay: '0.4s'}}></div>
            </div>
          )}
        </div>
      )}
      
      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex flex-col px-4 py-4 overflow-hidden">
        {/* Header */}
        <div className="text-center mb-4">
          <h1 className="text-4xl lg:text-6xl font-bold mb-3 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 animate-pulse" style={{ fontFamily: 'Starcraft, sans-serif' }}>
            M
            <img 
              src="https://monad-foundation.notion.site/image/https%3A%2F%2Fprod-files-secure.s3.us-west-2.amazonaws.com%2F8b536fe4-3bbf-45fc-b661-190b80c94bea%2Fc5c6a821-eed7-43e6-9a52-f32883fae734%2FMonad_Logo_-_Default_-_Logo_Mark.png?table=block&id=16863675-94f2-8005-a154-eea674b19e16&spaceId=8b536fe4-3bbf-45fc-b661-190b80c94bea&width=140&userId=&cache=v2"
              alt="Monad Logo" 
              className="inline-block w-10 h-10 lg:w-14 lg:h-14 mx-1"
              style={{ verticalAlign: 'text-bottom', marginBottom: '0.4rem' }}
            />
            NSWEEPER
            <img 
              src="/eric.png" 
              alt="Eric" 
              className="inline-block w-12 h-12 lg:w-16 lg:h-16 ml-1 rounded-full"
              style={{ verticalAlign: 'middle' }}
            />
          </h1>
          <div className="flex justify-center items-center gap-4 text-xs lg:text-sm text-cyan-400/80 font-mono">
            <div className="flex items-center gap-2 bg-black/50 px-2 py-1 border border-cyan-400/30">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span>POOL: {houseBalance.toFixed(2)} MON</span>
            </div>
            <div className="flex items-center gap-2 bg-black/50 px-2 py-1 border border-purple-400/30">
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
              <span>Made by <a href="https://x.com/0xbobaa" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300">boba</a> and <a href="https://x.com/eric168eth" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300">Eric</a>, Art by <a href="https://x.com/juju5378" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300">Juju</a></span>
            </div>
          </div>
        </div>

        {address && isConnected ? (
          <div className="text-center mb-3">
            <div className="bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-400/30 px-3 py-1 mb-2 font-mono text-cyan-300 text-sm">
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span>Connected Wallet: {address?.slice(0, 6)}...{address?.slice(-4)}</span>
              </div>
            </div>
            <w3m-button />
          </div>
        ) : (
          <div className="text-center mb-4">
            <button
              onClick={() => open()}
              className="bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold py-3 px-8 border-2 border-cyan-400/50 hover:border-cyan-300 transition-all duration-200 transform hover:scale-105 shadow-lg shadow-cyan-400/30 font-mono text-base"
            >
              ◤ Connect Wallet ◢
            </button>
          </div>
        )}

        {isConnected && (
        <div className="flex-1 w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-3 lg:gap-4 min-h-0">
          
          {/* Left Panel */}
          <div className="lg:col-span-1 space-y-3">
            {/* Stats Panel */}
            <div className="bg-gradient-to-br from-cyan-900/30 to-purple-900/30 border-2 border-cyan-400/40 p-3 backdrop-blur-sm">
              <h3 className="text-lg font-bold text-cyan-300 mb-2 border-b border-cyan-400/50 pb-1 font-mono tracking-wide">
                ◤ STATS ◢
              </h3>
              <div className="space-y-2 text-sm font-mono">
                <div className="flex justify-between items-center">
                  <span className="text-cyan-400/80">EARNED</span>
                  <span className="text-green-400 font-bold">+{totalEarned.toFixed(4)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-cyan-400/80">LOST</span>
                  <span className="text-red-400 font-bold">-{totalLost.toFixed(4)}</span>
                </div>
                <div className="flex justify-between items-center border-t border-cyan-400/30 pt-2">
                  <span className="text-cyan-300 font-bold">NET PROFIT</span>
                  <span className={`font-bold text-lg ${(totalEarned - totalLost) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {(totalEarned - totalLost) >= 0 ? '+' : ''}{(totalEarned - totalLost).toFixed(4)} MON
                  </span>
                </div>
              </div>
            </div>
            
            {/* Game Info Panel */}
            <div className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 border-2 border-purple-400/40 p-3 backdrop-blur-sm">
              <h3 className="text-lg font-bold text-purple-300 mb-2 border-b border-purple-400/50 pb-1 font-mono tracking-wide">
                ◤ STATUS ◢
              </h3>
              <div className="grid grid-cols-2 gap-2 text-sm font-mono">
                <div>
                  <p className="text-purple-400/80">MULTIPLIER</p>
                  <p className="text-lg font-bold text-white">{gameActive ? safeFinalMultiplier.toFixed(2) : "1.00"}x</p>
                </div>
                <div>
                  <p className="text-purple-400/80">POTENTIAL</p>
                  <p className="text-lg font-bold text-green-400">{gameActive ? potentialWin.toFixed(4) : "0.0000"}</p>
                </div>
                <div>
                  <p className="text-purple-400/80">SECTORS</p>
                  <p className="text-lg font-bold text-white">{clickedTileSequence.length}/{36 - numBombs}</p>
                </div>
                <div>
                  <p className="text-purple-400/80">HOSTILES</p>
                  <p className="text-lg font-bold text-red-400">{numBombs}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Center Panel: Game Board & Controls */}
          <div className="lg:col-span-3 space-y-3 flex flex-col min-h-0">
            <div className="flex justify-center">
               <div className="grid grid-cols-6 gap-1 lg:gap-2 p-2 lg:p-3 bg-gradient-to-br from-black/80 to-gray-900/80 border-2 border-cyan-400/50 shadow-[inset_0_0_30px_rgba(0,255,255,0.3)] backdrop-blur-sm">
                 {tiles.map((tile, index) => {
                   const isExploding = explodingTile === index;
                   const isBombTile = tile === 2 || (gameEndedWithBomb && bombPositions[index]);
                   
                   return (
                    <button
                      key={index}
                      onClick={() => handleTileClick(index)}
                      className={`relative w-12 h-12 lg:w-14 lg:h-14 font-bold text-xl flex justify-center items-center transition-all duration-200 overflow-hidden border-2 font-mono
                        ${!revealedTiles[index]
                          ? "bg-gradient-to-br from-gray-800 to-gray-900 border-gray-600 hover:border-cyan-400 hover:shadow-[0_0_15px_rgba(0,255,255,0.5)] cursor-pointer transform hover:scale-105"
                          : tile === 1
                            ? "bg-gradient-to-br from-cyan-600 to-blue-700 border-cyan-400 text-white cursor-default shadow-[0_0_15px_rgba(0,255,255,0.7)]"
                            : tile === 2
                              ? "bg-gradient-to-br from-red-600 to-red-800 border-red-400 text-white cursor-default shadow-[0_0_15px_rgba(255,0,0,0.7)]"
                              : "bg-gradient-to-br from-gray-700 to-gray-800 border-gray-500 cursor-default"
                        }
                        ${gameEndedWithBomb && bombPositions[index] && !revealedTiles[index]
                          ? "bg-gradient-to-br from-red-500 to-red-700 border-red-400 shadow-[0_0_15px_rgba(255,0,0,0.6)]"
                          : ""
                        }
                        ${(!gameActive || isTransactionPending || payoutLimitReached || gameEndedWithBomb) ? "opacity-60 cursor-not-allowed" : ""}
                      `}
                     disabled={!gameActive || revealedTiles[index] || isTransactionPending || payoutLimitReached || gameEndedWithBomb}
                    >
                      {/* Tile Content */}
                      {revealedTiles[index]
                        ? (isBombTile ? 
                           <img 
                             src="/eric.png"
                             alt="Eric Bomb"
                             className={`absolute inset-1 w-auto h-auto object-cover ${gameEndedWithBomb ? 'bomb-reveal' : ''}`}
                             style={{ width: 'calc(100% - 8px)', height: 'calc(100% - 8px)' }}
                           /> : 
                           tile === 1 ? (
                             <img 
                               src="https://monad-foundation.notion.site/image/https%3A%2F%2Fprod-files-secure.s3.us-west-2.amazonaws.com%2F8b536fe4-3bbf-45fc-b661-190b80c94bea%2Fc5c6a821-eed7-43e6-9a52-f32883fae734%2FMonad_Logo_-_Default_-_Logo_Mark.png?table=block&id=16863675-94f2-8005-a154-eea674b19e16&spaceId=8b536fe4-3bbf-45fc-b661-190b80c94bea&width=140&userId=&cache=v2"
                               alt="Monad Safe"
                               className="absolute inset-1 w-auto h-auto object-contain monad-safe-spin"
                               style={{ 
                                 width: 'calc(100% - 8px)', 
                                 height: 'calc(100% - 8px)',
                                 filter: `hue-rotate(${(index * 137) % 360}deg) saturate(1.5) brightness(1.2)`
                               }}
                             />
                           ) : ""
                          )
                        : (gameEndedWithBomb && bombPositions[index] ? 
                           <img 
                             src="/eric.png"
                             alt="Eric Bomb"
                             className="absolute inset-1 w-auto h-auto object-cover opacity-70 bomb-reveal"
                             style={{ width: 'calc(100% - 8px)', height: 'calc(100% - 8px)' }}
                           /> : 
                           <span className="text-cyan-400/30 text-xs font-mono">{index + 1}</span>
                          )
                       }
                    </button>
                   );
                 })}
               </div>
            </div>
            
             {/* Status Display */}
             <div className="text-center p-3 bg-gradient-to-r from-gray-900/80 to-black/80 border-2 border-cyan-400/40 backdrop-blur-sm">
               {payoutLimitReached ? (
                 <div className="text-center">
                   <p className="text-yellow-400 font-bold text-lg lg:text-xl animate-pulse font-mono">⚠ PAYOUT LIMIT REACHED ⚠</p>
                   <p className="text-yellow-300 text-xs lg:text-sm mt-1 font-mono">MAXIMUM EXTRACTION LIMIT • CASH OUT NOW</p>
                 </div>
               ) : (
                 <p className="font-medium text-base lg:text-lg text-cyan-300 font-mono">{status}</p>
               )}
               {gameError && (
                 <p className="text-red-400 mt-2 text-sm font-mono border-t border-red-400/30 pt-2">ERROR: {gameErrorText}</p>
               )}
             </div>

            {/* Game Controls */}
            {!gameActive && (
              <div className='flex flex-col items-center gap-3 bg-gradient-to-r from-gray-900/50 to-black/50 border-2 border-purple-400/40 p-4 backdrop-blur-sm'>
                <div className="flex justify-center items-center gap-3 flex-wrap">
                  <span className='font-bold text-purple-300 font-mono tracking-wide text-sm'>LEVEL:</span>
                   <button onClick={() => setDifficulty(0)} className={`font-bold py-2 px-4 border-2 transition-all duration-200 font-mono transform hover:scale-105 text-sm ${difficulty === 0 ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-cyan-400 shadow-[0_0_15px_rgba(0,255,255,0.5)]' : 'bg-transparent border-cyan-400/60 text-cyan-400 hover:bg-cyan-400/20'}`} disabled={isTransactionPending}>STANDARD</button>
                   <button onClick={() => setDifficulty(1)} className={`font-bold py-2 px-4 border-2 transition-all duration-200 font-mono transform hover:scale-105 text-sm ${difficulty === 1 ? 'bg-gradient-to-r from-red-500 to-red-600 text-white border-red-400 shadow-[0_0_15px_rgba(255,0,0,0.5)]' : 'bg-transparent border-red-400/60 text-red-400 hover:bg-red-400/20'}`} disabled={isTransactionPending}>CRITICAL</button>
                </div>
                <div className="flex justify-center items-center gap-2 flex-wrap">
                  <span className='font-bold text-purple-300 font-mono tracking-wide text-sm'>BET:</span>
                   {["0.25", "0.5", "1"].map((amount) => (
                     <button key={amount} onClick={() => setSelectedBet(amount)} className={`font-bold py-1 px-3 border-2 transition-all duration-200 font-mono transform hover:scale-105 text-sm ${selectedBet === amount ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white border-purple-400 shadow-[0_0_15px_rgba(128,0,128,0.5)]' : 'bg-transparent border-purple-400/60 text-purple-400 hover:bg-purple-400/20'}`} disabled={isTransactionPending}>{amount}</button>
                   ))}
                </div>
                 <button
                   onClick={handleStartGame}
                   className="w-full max-w-sm bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white font-bold py-3 px-8 border-2 border-cyan-400/50 shadow-lg shadow-cyan-400/30 hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-mono text-lg tracking-wide"
                   disabled={!isGameControlsEnabled}
                 >
                   ◤ START GAME ◢
                 </button>
              </div>
            )}
            {gameActive && (
                 <div className="flex items-center justify-center gap-3 w-full">
                   <button
                     onClick={handleCashOut}
                     className={`w-full max-w-sm font-bold py-3 px-8 border-2 shadow-lg transition-all duration-200 transform hover:scale-105 font-mono text-base lg:text-lg tracking-wide disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${
                       payoutLimitReached 
                         ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-black border-yellow-400 shadow-[0_0_20px_rgba(255,255,0,0.6)] animate-pulse' 
                         : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white border-green-400 shadow-[0_0_20px_rgba(0,255,0,0.4)]'
                     }`}
                     disabled={payoutLimitReached ? (!isConnected || !isWalletReady || isTransactionPending) : (!isGameControlsEnabled || clickedTileSequence.length === 0 || gameEndedWithBomb)}
                   >
                     {payoutLimitReached ? '◤ FORCED EXTRACTION ◢' : `◤ EXTRACT (${potentialWin.toFixed(4)}) ◢`}
                   </button>
                   {!payoutLimitReached && (
                     <button
                       onClick={handleForfeit}
                       className="bg-gradient-to-r from-gray-600 to-gray-500 text-white font-bold py-3 px-6 border-2 border-gray-400 shadow-lg shadow-[0_0_10px_rgba(128,128,128,0.3)] hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-mono text-base tracking-wide transform"
                       disabled={!isGameControlsEnabled}
                     >
                       ◤ SACRIFICE ◢
                     </button>
                   )}
                 </div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

export default App; 