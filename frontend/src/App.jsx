import { useState, useEffect, useRef, useMemo } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { createWalletClient, createPublicClient, custom, http, parseGwei } from 'viem';
import { ethers } from 'ethers';
import './App.css';

const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;

const MONAD_TESTNET = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
};

const abi = [
  "function startGame(bytes32 userCommitment, uint8 difficulty) external payable returns (bytes32)",
  "function revealRandomnessAndPlay(bytes32 gameId, bytes32 userRandomness, bytes32 providerRevelation) external",
  "function submitMovesAndCashOut(bytes32 gameId, uint8[] calldata clickedTiles) external",
  "function getGameInfo(bytes32 gameId) view returns (address player, uint256 bet, bool active, bool randomnessRevealed, uint8[] clickedTiles, uint8 difficulty, uint256 startTimestamp)",
  "function getPlayerStats(address player) view returns (uint256 totalEarned, uint256 totalLost, uint256 gamesPlayed, uint256 gamesWon)",
  "function getPlayerActiveGameCount(address player) view returns (uint256)",
  "function getPlayerActiveGames(address player) view returns (bytes32[])",
  "function calculatePotentialReward(bytes32 gameId, uint8 additionalClicks) view returns (uint256)",
  "function shouldForceCashout(bytes32 gameId, uint8 additionalClicks) view returns (bool, string)",
  "function getMaxBetAllowed() view returns (uint256)",
  "event GameStarted(bytes32 gameId, address player, uint256 bet, uint8 difficulty)",
  "event RandomnessRequested(bytes32 gameId, uint64 sequenceNumber)",
  "event RandomnessRevealed(bytes32 gameId, bytes32 randomValue)",
  "event CashedOut(bytes32 gameId, uint256 reward)",
  "event GameOver(bytes32 gameId)",
  "event ForcedCashout(bytes32 gameId, uint256 reward, string reason)"
];

function useTransaction() {
  const { user, ready } = usePrivy();
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
      if (!ready || !user?.wallet?.address) {
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

        let provider = null;
        if (user.wallet?.getEthereumProvider) {
          provider = await user.wallet.getEthereumProvider();
        } else if (user.wallet?.getEthersProvider) {
          const ethersProvider = await user.wallet.getEthersProvider();
          provider = ethersProvider?.provider;
        } else if (user.wallet?.provider) {
          provider = user.wallet.provider;
        } else if (
          user.wallet?.walletClientType === 'metamask' ||
          user.wallet?.connectorType === 'injected'
        ) {
          provider = window.ethereum;
        }

        if (!provider) {
          throw new Error("No compatible provider found!");
        }

        await switchToMonadTestnet(provider);

        walletClient.current = createWalletClient({
          chain: MONAD_TESTNET,
          transport: custom(provider),
          account: user.wallet.address
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
  }, [user, ready]);

  async function sendTransactionAndConfirm({ to, data, gas, value = 0 }) {
    try {
      if (!walletClient.current || !publicClient.current) {
        throw new Error("Wallet client not initialized.");
      }
      if (!user?.wallet?.address) {
        throw new Error("User wallet address not available.");
      }

      const txHash = await walletClient.current.sendTransaction({
        to,
        account: user.wallet.address,
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
  const { user, authenticated, login, logout } = usePrivy();
  const { walletClient, publicClient, sendTransactionAndConfirm, isWalletReady } = useTransaction();
  
  // Game state
  const [gameId, setGameId] = useState(null);
  const [gameActive, setGameActive] = useState(false);
  const [randomnessRevealed, setRandomnessRevealed] = useState(false);
  const [tiles, setTiles] = useState(Array(36).fill(0));
  const [revealedTiles, setRevealedTiles] = useState(Array(36).fill(false));
  const [clickedTileSequence, setClickedTileSequence] = useState([]);
  const [userRandomness, setUserRandomness] = useState(null);
  const [finalRandomness, setFinalRandomness] = useState(null);
  const [tilesClicked, setTilesClicked] = useState(0);
  const [difficulty, setDifficulty] = useState(0); // 0 = NORMAL, 1 = GOD_OF_WAR
  const [selectedBet, setSelectedBet] = useState("0.01");
  const [status, setStatus] = useState("Status: Not connected");
  const [gameError, setGameError] = useState(false);
  const [gameErrorText, setGameErrorText] = useState("");
  const [isTransactionPending, setIsTransactionPending] = useState(false);
  const [gameEndedWithBomb, setGameEndedWithBomb] = useState(false);
  
  // PnL tracking (persistent)
  const [playerStats, setPlayerStats] = useState({
    totalEarned: 0,
    totalLost: 0,
    gamesPlayed: 0,
    gamesWon: 0
  });
  
  // Force cashout state
  const [showForceCashoutModal, setShowForceCashoutModal] = useState(false);
  const [forceCashoutReason, setForceCashoutReason] = useState("");
  const [maxBetAllowed, setMaxBetAllowed] = useState("0");

  const contractInterface = useMemo(() => new ethers.Interface(abi), []);

  // Load player stats on wallet connect
  useEffect(() => {
    if (authenticated && isWalletReady && user?.wallet?.address) {
      loadPlayerStats();
      loadMaxBetAllowed();
    }
  }, [authenticated, isWalletReady, user?.wallet?.address]);

  const loadPlayerStats = async () => {
    try {
      if (!publicClient.current || !user?.wallet?.address) return;

      const data = contractInterface.encodeFunctionData("getPlayerStats", [user.wallet.address]);
      
      const result = await publicClient.current.call({
        to: contractAddress,
        data: data
      });

      const decoded = contractInterface.decodeFunctionResult("getPlayerStats", result.data);
      
      setPlayerStats({
        totalEarned: parseFloat(ethers.formatEther(decoded[0])),
        totalLost: parseFloat(ethers.formatEther(decoded[1])),
        gamesPlayed: Number(decoded[2]),
        gamesWon: Number(decoded[3])
      });
    } catch (error) {
      console.error("Error loading player stats:", error);
    }
  };

  const loadMaxBetAllowed = async () => {
    try {
      if (!publicClient.current) return;

      const data = contractInterface.encodeFunctionData("getMaxBetAllowed", []);
      
      const result = await publicClient.current.call({
        to: contractAddress,
        data: data
      });

      const decoded = contractInterface.decodeFunctionResult("getMaxBetAllowed", result.data);
      setMaxBetAllowed(ethers.formatEther(decoded[0]));
    } catch (error) {
      console.error("Error loading max bet:", error);
    }
  };

  const checkForForceCashout = async (additionalClicks = 0) => {
    try {
      if (!gameId || !publicClient.current) return;

      const data = contractInterface.encodeFunctionData("shouldForceCashout", [gameId, additionalClicks]);
      
      const result = await publicClient.current.call({
        to: contractAddress,
        data: data
      });

      const decoded = contractInterface.decodeFunctionResult("shouldForceCashout", result.data);
      const shouldForce = decoded[0];
      const reason = decoded[1];

      if (shouldForce) {
        setForceCashoutReason(reason);
        setShowForceCashoutModal(true);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error checking force cashout:", error);
      return false;
    }
  };

  useEffect(() => {
    if (!authenticated) {
      setStatus("Status: Not connected");
    } else if (!isWalletReady) {
      setStatus("Status: Connecting wallet...");
    } else {
      setStatus("🎮 Ready to play!");
    }
  }, [authenticated, isWalletReady]);

  const generateBombPositions = (randomness, numBombs) => {
    const bombPositions = new Set();
    let currentSeed = BigInt(randomness);
    let bombsPlaced = 0;
    let attempts = 0;
    
    while (bombsPlaced < numBombs && attempts < 200) {
      const hash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint8", "uint8"], 
        [currentSeed, bombsPlaced, attempts]
      ));
      const bombPos = Number(BigInt(hash) % BigInt(36));
      
      if (!bombPositions.has(bombPos)) {
        bombPositions.add(bombPos);
        bombsPlaced++;
      }
      
      currentSeed = BigInt(ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint8"], [currentSeed, attempts])
      ));
      attempts++;
    }
    
    return Array.from(bombPositions);
  };

  const checkIfTileIsBomb = (position) => {
    if (!finalRandomness) return false;
    
    const numBombs = difficulty === 1 ? 12 : 9;
    const bombPositions = generateBombPositions(finalRandomness, numBombs);
    return bombPositions.includes(position);
  };

  const revealAllBombs = () => {
    if (!finalRandomness) return;
    
    const numBombs = difficulty === 1 ? 12 : 9;
    const bombPositions = generateBombPositions(finalRandomness, numBombs);
    
    const updatedTiles = [...tiles];
    const updatedRevealed = [...revealedTiles];
    
    bombPositions.forEach(pos => {
      updatedTiles[pos] = 2;
      updatedRevealed[pos] = true;
    });
    
    setTiles(updatedTiles);
    setRevealedTiles(updatedRevealed);
  };

  const handleStartGame = async () => {
    try {
      setGameError(false);
      setGameErrorText("");
      setIsTransactionPending(true);

      if (!authenticated || !user?.wallet?.address) {
        setStatus("❌ Please connect your wallet first.");
        return;
      }

      if (!isWalletReady || !walletClient.current || !publicClient.current) {
        setStatus("❌ Wallet not ready. Please wait or refresh.");
        return;
      }

      // Check max bet allowed
      const maxBet = parseFloat(maxBetAllowed);
      if (parseFloat(selectedBet) > maxBet) {
        setStatus(`❌ Bet exceeds maximum allowed: ${maxBet.toFixed(4)} MON`);
        return;
      }

      setStatus("🎲 Starting game...");

      // Generate user randomness for Pyth Entropy commitment
      const newUserRandomness = ethers.randomBytes(32);
      setUserRandomness(ethers.hexlify(newUserRandomness));

      // Create commitment
      const userCommitment = ethers.keccak256(newUserRandomness);

      const betValue = ethers.parseEther(selectedBet);
      const data = contractInterface.encodeFunctionData("startGame", [userCommitment, difficulty]);

      const txHash = await sendTransactionAndConfirm({
        to: contractAddress,
        data,
        gas: 500000, // Increased gas for entropy operations
        value: betValue,
      });

      setStatus(`🔄 Transaction sent! Hash: ${txHash.slice(0, 10)}...`);

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
        throw new Error("GameStarted event not found.");
      }

      const receivedGameId = gameStartedEvent.args.gameId;
      setGameId(receivedGameId);
      setGameActive(true);
      setRandomnessRevealed(false);
      setTilesClicked(0);
      setClickedTileSequence([]);
      setTiles(Array(36).fill(0));
      setRevealedTiles(Array(36).fill(false));
      setGameEndedWithBomb(false);

      // Update local stats (will be synced after game ends)
      setPlayerStats(prev => ({
        ...prev,
        totalLost: prev.totalLost + parseFloat(selectedBet),
        gamesPlayed: prev.gamesPlayed + 1
      }));

      setStatus(`🎮 Game Started! Now reveal randomness to play. ID: ${receivedGameId.slice(0, 10)}...`);
    } catch (err) {
      console.error("Error starting game:", err);
      setGameError(true);
      setGameErrorText(err.message);
      setStatus(`❌ Failed to start: ${err.message}`);
    } finally {
      setIsTransactionPending(false);
    }
  };

  const handleRevealRandomness = async () => {
    try {
      setIsTransactionPending(true);
      setStatus("🔓 Revealing randomness...");

      if (!gameId || !userRandomness) {
        throw new Error("Game not properly initialized");
      }

      // For this demo, we'll use a placeholder provider revelation
      // In production, this would come from the Pyth Entropy provider
      const providerRevelation = ethers.randomBytes(32);

      const data = contractInterface.encodeFunctionData("revealRandomnessAndPlay", [
        gameId,
        userRandomness,
        ethers.hexlify(providerRevelation)
      ]);

      const txHash = await sendTransactionAndConfirm({
        to: contractAddress,
        data,
        gas: 300000,
      });

      setStatus(`🔄 Revealing... Hash: ${txHash.slice(0, 10)}...`);

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

      const randomnessRevealedEvent = parsedLogs.find(e => e.name === "RandomnessRevealed");
      if (randomnessRevealedEvent) {
        setFinalRandomness(randomnessRevealedEvent.args.randomValue);
        setRandomnessRevealed(true);
        setStatus("🎯 Randomness revealed! Click tiles to play!");
      } else {
        throw new Error("RandomnessRevealed event not found");
      }
    } catch (err) {
      console.error("Error revealing randomness:", err);
      setGameError(true);
      setGameErrorText(err.message);
      setStatus(`❌ Failed to reveal: ${err.message}`);
    } finally {
      setIsTransactionPending(false);
    }
  };

  const handleTileClick = async (pos) => {
    if (!gameActive || !randomnessRevealed || revealedTiles[pos] || isTransactionPending) return;

    // Check for force cashout before allowing the move
    const shouldForce = await checkForForceCashout(1);
    if (shouldForce) {
      return; // Don't allow the move, force cashout modal will show
    }

    const isBomb = checkIfTileIsBomb(pos);
    
    const updatedRevealed = [...revealedTiles];
    updatedRevealed[pos] = true;
    setRevealedTiles(updatedRevealed);

    const updatedTiles = [...tiles];
    
    if (isBomb) {
      updatedTiles[pos] = 2;
      setTiles(updatedTiles);
      revealAllBombs();
      setGameActive(false);
      setGameEndedWithBomb(true);
      setStatus("💥 Bomb! Game Over");
      await loadPlayerStats(); // Refresh stats
      return;
    }

    updatedTiles[pos] = 1;
    setTiles(updatedTiles);
    
    setTilesClicked(prev => prev + 1);
    setClickedTileSequence(prev => [...prev, pos]);

    const numBombs = difficulty === 1 ? 12 : 9;
    const multiplier = calculateMultiplier(tilesClicked + 1, numBombs);
    const godOfWarBonus = difficulty === 1 ? 1.5 : 1;
    const finalMultiplier = multiplier * godOfWarBonus * 0.95;

    setStatus(`✅ Safe! Tiles: ${tilesClicked + 1} | Multiplier: ${finalMultiplier.toFixed(4)}x`);
  };

  const handleCashOut = async () => {
    if (!gameActive || !randomnessRevealed || tilesClicked === 0 || isTransactionPending) {
      setStatus("❌ Cannot cash out now");
      return;
    }

    if (!isWalletReady || !walletClient.current || !publicClient.current) {
      setStatus("❌ Wallet not ready.");
      return;
    }

    try {
      setIsTransactionPending(true);
      setStatus("💰 Cashing out...");

      const data = contractInterface.encodeFunctionData("submitMovesAndCashOut", [gameId, clickedTileSequence]);
      
      const txHash = await sendTransactionAndConfirm({
        to: contractAddress,
        data,
        gas: 300000 + clickedTileSequence.length * 20000,
      });

      setStatus(`🔄 Processing cashout... Hash: ${txHash.slice(0, 10)}...`);

      const receipt = await publicClient.current.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status === 0n) {
        setGameActive(false);
        setGameEndedWithBomb(true);
        setStatus("💥 Game Over - You hit a bomb!");
        setClickedTileSequence([]);
        await loadPlayerStats();
        return;
      }

      const parsedLogs = receipt.logs
        .map(log => {
          try {
            return contractInterface.parseLog(log);
          } catch (e) {
            return null;
          }
        })
        .filter(log => log !== null);

      const cashedOutEvent = parsedLogs.find(e => e.name === "CashedOut");
      const forcedCashoutEvent = parsedLogs.find(e => e.name === "ForcedCashout");
      const gameOverEvent = parsedLogs.find(e => e.name === "GameOver");

      if (gameOverEvent) {
        setGameActive(false);
        setGameEndedWithBomb(true);
        setStatus("💥 Game Over (Contract Confirmed)");
        setClickedTileSequence([]);
        await loadPlayerStats();
        return;
      }

      let reward = 0;
      let eventFound = false;

      if (forcedCashoutEvent) {
        reward = parseFloat(ethers.formatEther(forcedCashoutEvent.args.reward));
        setStatus(`💰 Forced Cashout: ${reward.toFixed(4)} MON - ${forcedCashoutEvent.args.reason}`);
        eventFound = true;
      } else if (cashedOutEvent) {
        reward = parseFloat(ethers.formatEther(cashedOutEvent.args.reward));
        setStatus(`💰 Cashed Out: ${reward.toFixed(4)} MON`);
        eventFound = true;
      }

      if (eventFound) {
        setPlayerStats(prev => ({
          ...prev,
          totalEarned: prev.totalEarned + reward,
          gamesWon: prev.gamesWon + 1
        }));
      }

      setGameActive(false);
      setClickedTileSequence([]);
      setGameEndedWithBomb(false);
      setShowForceCashoutModal(false);
      
      await loadPlayerStats(); // Refresh from contract
      await loadMaxBetAllowed(); // Refresh max bet
    } catch (err) {
      console.error("Error cashing out:", err);
      setGameError(true);
      setGameErrorText(err.message);
      setStatus(`❌ Cashout failed: ${err.message}`);
    } finally {
      setIsTransactionPending(false);
    }
  };

  const calculateMultiplier = (safeClicks, numBombs = 9) => {
    let multiplier = 1.0;
    const safeTiles = 36 - numBombs;
    
    for (let i = 0; i < safeClicks; i++) {
      const prob = (safeTiles - i) / (36 - i);
      multiplier *= (1 / prob);
    }
    
    return multiplier;
  };

  const selectBet = (amount) => {
    if (!gameActive && !isTransactionPending) {
      setSelectedBet(amount);
    }
  };

  const selectDifficulty = (diff) => {
    if (!gameActive && !isTransactionPending) {
      setDifficulty(diff);
    }
  };

  const isGameControlsEnabled = authenticated && isWalletReady && !isTransactionPending;
  const numBombs = difficulty === 1 ? 12 : 9;
  const maxSafeTiles = 36 - numBombs;
  const currentMultiplier = calculateMultiplier(tilesClicked, numBombs);
  const godOfWarBonus = difficulty === 1 ? 1.5 : 1;
  const finalMultiplier = currentMultiplier * godOfWarBonus * 0.95;
  const potentialWin = finalMultiplier * parseFloat(selectedBet);

  return (
    <div className="min-h-screen min-w-screen w-full h-full bg-gray-900 flex flex-col justify-center items-center">
      <div className="w-full max-w-4xl bg-white/10 backdrop-blur-lg rounded-3xl p-8 shadow-2xl border border-white/20">
        <h1 className="text-5xl font-bold mb-8 text-center bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Monsweeper 💣
        </h1>
        
        {user && authenticated ? (
          <div className="text-center mb-6">
            <button 
              onClick={logout} 
              className="bg-white/20 backdrop-blur-sm text-white font-semibold py-2 px-6 rounded-full border border-white/30 hover:bg-white/30 transition-all duration-200 mb-3"
              disabled={isTransactionPending}
            >
              Disconnect
            </button>
            <p className="text-white/80 text-sm">Connected: {user?.wallet?.address?.slice(0, 6)}...{user?.wallet?.address?.slice(-4)}</p>
            
            {/* Player Stats - Persistent PnL */}
            <div className="mt-4 p-4 bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20">
              <h3 className="text-lg font-semibold text-white mb-2">Your Stats</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <div>
                  <p className="text-white/80 text-sm">Net P&L</p>
                  <p className={`text-lg font-bold ${(playerStats.totalEarned - playerStats.totalLost) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {(playerStats.totalEarned - playerStats.totalLost >= 0 ? '+' : '')}{(playerStats.totalEarned - playerStats.totalLost).toFixed(4)} MON
                  </p>
                </div>
                <div>
                  <p className="text-white/80 text-sm">Win Rate</p>
                  <p className="text-lg font-bold text-blue-400">
                    {playerStats.gamesPlayed > 0 ? ((playerStats.gamesWon / playerStats.gamesPlayed) * 100).toFixed(1) : 0}%
                  </p>
                </div>
                <div>
                  <p className="text-white/80 text-sm">Total Earned</p>
                  <p className="text-lg font-bold text-green-400">+{playerStats.totalEarned.toFixed(4)} MON</p>
                </div>
                <div>
                  <p className="text-white/80 text-sm">Games Won</p>
                  <p className="text-lg font-bold text-white">{playerStats.gamesWon}/{playerStats.gamesPlayed}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center mb-6">
            <button 
              onClick={login} 
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold py-3 px-8 rounded-full hover:from-purple-600 hover:to-pink-600 transition-all duration-200 shadow-lg"
            >
              Connect Wallet
            </button>
          </div>
        )}

        {authenticated && (
          <div className="space-y-6">
            {/* Difficulty Selection */}
            <div className="text-center">
              <p className="text-white/90 mb-4 font-medium">Select Difficulty:</p>
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => selectDifficulty(0)}
                  className={`py-3 px-6 rounded-full font-semibold transition-all duration-200 border-2
                    ${difficulty === 0 
                      ? "bg-blue-500 text-white border-blue-400 shadow-lg" 
                      : "bg-white/10 text-white border-white/30 hover:bg-white/20 hover:border-white/50"
                    }
                    ${(gameActive || isTransactionPending) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                  disabled={gameActive || isTransactionPending}
                >
                  Normal Mode<br/>
                  <span className="text-sm opacity-80">9 bombs</span>
                </button>
                <button
                  onClick={() => selectDifficulty(1)}
                  className={`py-3 px-6 rounded-full font-semibold transition-all duration-200 border-2
                    ${difficulty === 1
                      ? "bg-red-600 text-white border-red-400 shadow-lg"
                      : "bg-white/10 text-white border-white/30 hover:bg-white/20 hover:border-white/50"
                    }
                    ${(gameActive || isTransactionPending) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                  disabled={gameActive || isTransactionPending}
                >
                  God of War<br/>
                  <span className="text-sm opacity-80">12 bombs, 1.5x payout</span>
                </button>
              </div>
            </div>

            {/* Bet Selection */}
            <div className="text-center">
              <p className="text-white/90 mb-4 font-medium">Select Bet:</p>
              <div className="flex justify-center gap-4">
                {["0.25", "0.5", "1", "3", "5", "10"].map((amount) => (
                  <button
                    key={amount}
                    onClick={() => selectBet(amount)}
                    className={`py-2 px-5 rounded-full font-semibold border-2 transition-all duration-200
                      ${selectedBet === amount
                        ? "bg-green-500 text-white border-green-400 shadow-lg"
                        : "bg-white/10 text-white border-white/30 hover:bg-white/20 hover:border-white/50"
                      }
                      ${(gameActive || isTransactionPending) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    disabled={gameActive || isTransactionPending}
                  >
                    {amount} MON
                  </button>
                ))}
              </div>
              <div className="mt-2 text-xs text-white/70">Max bet: {parseFloat(maxBetAllowed).toFixed(4)} MON</div>
            </div>

            {/* Game Controls */}
            <div className="flex flex-col items-center gap-4 mt-6">
              {!gameActive && !randomnessRevealed && (
                <button
                  onClick={handleStartGame}
                  className="bg-gradient-to-r from-green-500 to-blue-500 text-white font-bold py-3 px-10 rounded-full shadow-lg hover:from-green-600 hover:to-blue-600 transition-all duration-200"
                  disabled={!isGameControlsEnabled}
                >
                  Start Game
                </button>
              )}
              {gameActive && !randomnessRevealed && (
                <button
                  onClick={handleRevealRandomness}
                  className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold py-3 px-10 rounded-full shadow-lg hover:from-yellow-600 hover:to-orange-600 transition-all duration-200"
                  disabled={!isGameControlsEnabled}
                >
                  Reveal Randomness
                </button>
              )}
              {gameActive && randomnessRevealed && (
                <button
                  onClick={handleCashOut}
                  className="bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold py-3 px-10 rounded-full shadow-lg hover:from-pink-600 hover:to-purple-600 transition-all duration-200"
                  disabled={!isGameControlsEnabled || tilesClicked === 0}
                >
                  Cash Out
                </button>
              )}
            </div>

            {/* Game Board */}
            <div className="flex flex-col items-center mt-8">
              <div className="grid grid-cols-6 gap-2">
                {tiles.map((tile, idx) => (
                  <button
                    key={idx}
                    className={`w-12 h-12 rounded-lg flex items-center justify-center text-lg font-bold border-2
                      ${revealedTiles[idx]
                        ? tile === 2
                          ? "bg-red-600 text-white border-red-400"
                          : "bg-green-400 text-white border-green-400"
                        : "bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700 hover:text-white"
                      }
                      ${(gameActive && randomnessRevealed && !revealedTiles[idx] && !showForceCashoutModal) ? "cursor-pointer" : "cursor-not-allowed"}`}
                    disabled={!gameActive || !randomnessRevealed || revealedTiles[idx] || showForceCashoutModal}
                    onClick={() => handleTileClick(idx)}
                  >
                    {revealedTiles[idx] ? (tile === 2 ? "💣" : "✔️") : ""}
                  </button>
                ))}
              </div>
              <div className="mt-4 text-white/80 text-lg font-semibold">{status}</div>
              {gameError && <div className="mt-2 text-red-400 font-bold">{gameErrorText}</div>}
              {gameEndedWithBomb && <div className="mt-2 text-red-400 font-bold">Game Over! You hit a bomb.</div>}
              {showForceCashoutModal && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
                  <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-md w-full text-center">
                    <h2 className="text-2xl font-bold mb-4 text-red-600">Force Cashout Required</h2>
                    <p className="mb-4 text-gray-800">{forceCashoutReason || "You have reached the maximum allowed reward for this game. Please cash out to continue playing."}</p>
                    <button
                      onClick={handleCashOut}
                      className="bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold py-3 px-10 rounded-full shadow-lg hover:from-pink-600 hover:to-purple-600 transition-all duration-200"
                      disabled={!isGameControlsEnabled || tilesClicked === 0}
                    >
                      Cash Out
                    </button>
                  </div>
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