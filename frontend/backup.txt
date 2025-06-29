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
  "function startGame(uint256 seed) external payable returns (bytes32)",
  "function submitMovesAndCashOut(bytes32 gameId, uint8[] calldata clickedTiles) external",
  "event GameStarted(bytes32 gameId, address player, uint256 bet)",
  "event CashedOut(bytes32 gameId, uint256 reward)",
  "event GameOver(bytes32 gameId)",
  "function getGameInfo(bytes32 gameId) view returns (address player, uint256 seed, uint256 bet, bool active, uint8[] clickedTiles)"
];

function useTransaction() {
  const { user, ready } = usePrivy();
  const walletClient = useRef(null);
  const publicClient = useRef(null);
  const [isWalletReady, setIsWalletReady] = useState(false);

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

  const [gameId, setGameId] = useState(null);
  const [gameActive, setGameActive] = useState(false);
  const [tiles, setTiles] = useState(Array(36).fill(0)); // 0: unrevealed, 1: safe, 2: bomb
  const [revealedTiles, setRevealedTiles] = useState(Array(36).fill(false));
  const [clickedTileSequence, setClickedTileSequence] = useState([]);
  const [seed, setSeed] = useState(null);
  const [tilesClicked, setTilesClicked] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [totalLost, setTotalLost] = useState(0);
  const [selectedBet, setSelectedBet] = useState("0.01");
  const [status, setStatus] = useState("Status: Not connected");
  const [gameError, setGameError] = useState(false);
  const [gameErrorText, setGameErrorText] = useState("");
  const [isTransactionPending, setIsTransactionPending] = useState(false);
  const [gameEndedWithBomb, setGameEndedWithBomb] = useState(false);

  const contractInterface = useMemo(() => new ethers.Interface(abi), []);

  useEffect(() => {
    if (!authenticated) {
      setStatus("Status: Not connected");
    } else if (!isWalletReady) {
      setStatus("Status: Connecting wallet...");
    } else {
      setStatus("🎮 Ready to play!");
    }
  }, [authenticated, isWalletReady]);

  const initializeBoard = (initialSeed) => {
    const newTiles = Array(36).fill(0);
    const bombPositions = new Set();
    let currentSeed = BigInt(initialSeed);

    // Match the contract's bomb placement logic exactly
    for (let i = 0; i < 9; i++) {
      // Use the same hash computation as the contract
      const encoded = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [currentSeed, i]);
      const hash = ethers.keccak256(encoded);
      const pos = Number(BigInt(hash) % BigInt(36));
      
      // Update seed for next iteration (same as contract)
      currentSeed = BigInt(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [currentSeed])));
      
      // In the contract, bombs are placed sequentially without checking for duplicates
      // So we'll place them in the same positions as the contract would
      newTiles[pos] = 2; // Mark as bomb
    }

    return newTiles;
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

      setStatus("🎲 Starting game...");

      const newSeed = Math.floor(Math.random() * 1e9);
      setSeed(newSeed);

      const betValue = ethers.parseEther(selectedBet);
      const data = contractInterface.encodeFunctionData("startGame", [newSeed]);

      const txHash = await sendTransactionAndConfirm({
        to: contractAddress,
        data,
        gas: 300000,
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
      setTilesClicked(0);
      setClickedTileSequence([]);
      setTiles(initializeBoard(newSeed));
      setRevealedTiles(Array(36).fill(false));
      setGameEndedWithBomb(false);
      setTotalLost(prev => prev + parseFloat(selectedBet));

      // Validate that our board matches the contract
      validateBoardWithContract(newSeed);

      setStatus(`🎮 Game Started! ID: ${receivedGameId.slice(0, 10)}...`);
    } catch (err) {
      console.error("Error starting game:", err);
      setGameError(true);
      setGameErrorText(err.message);
      setStatus(`❌ Failed to start: ${err.message}`);
    } finally {
      setIsTransactionPending(false);
    }
  };

  const handleTileClick = (pos) => {
    if (!gameActive || revealedTiles[pos] || isTransactionPending) return;

    const isLocalBomb = tiles[pos] === 2;
    const updatedRevealed = [...revealedTiles];
    updatedRevealed[pos] = true;
    setRevealedTiles(updatedRevealed);

    if (isLocalBomb) {
      // Reveal all bomb tiles when game over
      const allBombsRevealed = [...updatedRevealed];
      tiles.forEach((tile, index) => {
        if (tile === 2) { // If it's a bomb
          allBombsRevealed[index] = true;
        }
      });
      setRevealedTiles(allBombsRevealed);
      
      setGameActive(false);
      setStatus("💥 Bomb! Game Over");
      // Don't add bomb position to clickedTileSequence - contract expects only safe moves
      setGameEndedWithBomb(true);
      return;
    }

    // Only add safe moves to the sequence (contract expects only safe moves)
    setTilesClicked(prev => prev + 1);
    setClickedTileSequence(prev => [...prev, pos]);
    const multiplier = calculateMultiplier(tilesClicked + 1) * 0.95;
    setStatus(`✅ Safe! Tiles: ${tilesClicked + 1} | Multiplier: ${multiplier.toFixed(4)}x`);
  };

  const handleCashOut = async () => {
    if (!gameActive || tilesClicked === 0 || isTransactionPending) {
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

      // Only send safe moves to the contract (no bombs in the sequence)
      const safeMoves = clickedTileSequence.filter(pos => tiles[pos] !== 2);

      // Debug: Log the full board and moves
      console.log("--- Cashout Debug ---");
      console.log("Game ID:", gameId);
      console.log("Full board (tiles):", tiles);
      console.log("Clicked tile sequence:", clickedTileSequence);
      console.log("Safe moves sequence:", safeMoves);
      console.log("Number of safe moves:", safeMoves.length);
      console.log("Player address:", user?.wallet?.address);
      console.log("--- End Debug ---");

      const data = contractInterface.encodeFunctionData("submitMovesAndCashOut", [gameId, safeMoves]);
      
      const txHash = await sendTransactionAndConfirm({
        to: contractAddress,
        data,
        gas: 300000 + safeMoves.length * 20000, // Adjust gas based on number of moves
      });

      setStatus(`🔄 Processing cashout... Hash: ${txHash.slice(0, 10)}...`);

      const receipt = await publicClient.current.waitForTransactionReceipt({ hash: txHash });
      
      // Debug: Log transaction status
      console.log("Transaction status:", receipt.status === 1n ? "Success" : "Reverted");
      console.log("Transaction logs:", receipt.logs);
      
      // Check if transaction was successful
      if (receipt.status === 0n) {
        throw new Error("Transaction reverted by smart contract. This usually means the contract logic failed.");
      }
      
      const parsedLogs = receipt.logs
        .map(log => {
          try {
            return contractInterface.parseLog(log);
          } catch (e) {
            console.log("Failed to parse log:", log, "Error:", e);
            return null;
          }
        })
        .filter(log => log !== null);

      console.log("Parsed logs:", parsedLogs);

      const cashedOutEvent = parsedLogs.find(e => e.name === "CashedOut");
      const gameOverEvent = parsedLogs.find(e => e.name === "GameOver");

      if (gameOverEvent) {
        setGameActive(false);
        setStatus("💥 Game Over (Contract Confirmed)");
        setClickedTileSequence([]);
        return;
      }

      if (!cashedOutEvent) {
        // Try to find any event that might indicate success
        const anyEvent = parsedLogs[0];
        if (anyEvent) {
          console.log("Found event but not CashedOut:", anyEvent);
          // If we found some event, assume it was successful
          setGameActive(false);
          setClickedTileSequence([]);
          setGameEndedWithBomb(false);
          setStatus("💰 Cashout completed (event details unclear)");
          return;
        }
        throw new Error("CashedOut event not found. Check contract events.");
      }

      const reward = parseFloat(ethers.formatEther(cashedOutEvent.args.reward));
      setTotalEarned(prev => prev + reward);
      setGameActive(false);
      setClickedTileSequence([]);
      setGameEndedWithBomb(false);
      setStatus(`💰 Cashed Out: ${reward.toFixed(4)} MON`);
    } catch (err) {
      console.error("Error cashing out:", err);
      setGameError(true);
      setGameErrorText(err.message);
      setStatus(`❌ Cashout failed: ${err.message}`);
    } finally {
      setIsTransactionPending(false);
    }
  };

  const calculateMultiplier = (safeClicks) => {
    let multiplier = 1.0;
    for (let i = 0; i < safeClicks; i++) {
      const prob = (36 - 9 - i) / (36 - i);
      multiplier *= (1 / prob);
    }
    return multiplier;
  };

  const validateBoardWithContract = (seed) => {
    const contractBoard = Array(36).fill(0);
    let currentSeed = BigInt(seed);

    // Generate board exactly as contract would
    for (let i = 0; i < 9; i++) {
      const encoded = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [currentSeed, i]);
      const hash = ethers.keccak256(encoded);
      const pos = Number(BigInt(hash) % BigInt(36));
      currentSeed = BigInt(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [currentSeed])));
      contractBoard[pos] = 2;
    }

    // Compare with frontend board
    const frontendBoard = tiles;
    const mismatches = [];
    for (let i = 0; i < 36; i++) {
      if (frontendBoard[i] !== contractBoard[i]) {
        mismatches.push({ position: i, frontend: frontendBoard[i], contract: contractBoard[i] });
      }
    }

    if (mismatches.length > 0) {
      console.warn("Board mismatch detected:", mismatches);
    } else {
      console.log("Board validation passed - frontend matches contract");
    }

    return mismatches.length === 0;
  };

  const selectBet = (amount) => {
    if (!gameActive && !isTransactionPending) {
      setSelectedBet(amount);
    }
  };

  const isGameControlsEnabled = authenticated && isWalletReady && !isTransactionPending;

  async function debugGetGameInfo(gameId) {
    if (!publicClient.current) {
      console.log("No public client");
      return;
    }
    try {
      const data = contractInterface.encodeFunctionData("getGameInfo", [gameId]);
      const result = await publicClient.current.call({
        to: contractAddress,
        data,
      });
      const hexData = result.data || result;
      const [player, seed, bet, active, clickedTiles] = contractInterface.decodeFunctionResult("getGameInfo", hexData);
      console.log("getGameInfo result:", { player, seed, bet, active, clickedTiles });
    } catch (err) {
      console.error("Error calling getGameInfo:", err);
    }
  }

  // Make debugGetGameInfo available in the browser console
  window.debugGetGameInfo = debugGetGameInfo;

  return (
    <div className="bg-[#836EF9] text-white text-center p-8 min-h-screen font-sans">
      <h1 className="text-4xl mb-4">Monsweeper 💣</h1>
      
      {user && authenticated ? (
        <div>
          <button 
            onClick={logout} 
            className="bg-white text-[#836EF9] font-bold py-2 px-4 rounded-lg m-2"
            disabled={isTransactionPending}
          >
            Logout
          </button>
          <p className="mb-4">Connected: {user?.wallet?.address?.slice(0, 6)}...{user?.wallet?.address?.slice(-4)}</p>
        </div>
      ) : (
        <button 
          onClick={login} 
          className="bg-white text-[#836EF9] font-bold py-2 px-4 rounded-lg m-2"
        >
          Connect Wallet
        </button>
      )}

      {authenticated && (
        <div className="mt-4">
          <div className="mb-4">
            <p className="mb-2">Select Bet Amount:</p>
            {["0.01", "0.1", "1"].map(amount => (
              <button
                key={amount}
                onClick={() => selectBet(amount)}
                className={`py-2 px-4 m-2 rounded-lg border-2 border-white font-bold transition-colors
                  ${selectedBet === amount ? "bg-white text-[#836EF9]" : "bg-transparent text-white hover:bg-white hover:text-[#836EF9]"}
                  ${(gameActive || isTransactionPending) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                disabled={gameActive || isTransactionPending}
              >
                {amount} MON
              </button>
            ))}
          </div>

          <div className="mb-4">
            <button
              onClick={handleStartGame}
              className={`bg-white text-[#836EF9] font-bold py-2 px-6 rounded-lg m-2 transition-opacity
                ${(!isGameControlsEnabled || gameActive) ? "opacity-50 cursor-not-allowed" : "hover:opacity-90"}`}
              disabled={!isGameControlsEnabled || gameActive}
            >
              {isTransactionPending ? "Starting..." : "Start Game"}
            </button>
            
            <button
              onClick={handleCashOut}
              className={`bg-green-500 text-white font-bold py-2 px-6 rounded-lg m-2 transition-opacity
                ${(!isGameControlsEnabled || !gameActive || tilesClicked === 0) ? "opacity-50 cursor-not-allowed" : "hover:opacity-90"}`}
              disabled={!isGameControlsEnabled || !gameActive || tilesClicked === 0}
            >
              {isTransactionPending ? "Cashing..." : `Cash Out (${(calculateMultiplier(tilesClicked) * 0.95 * parseFloat(selectedBet)).toFixed(4)} MON)`}
            </button>
          </div>

          {(gameActive || revealedTiles.some(tile => tile)) && (
            <div className="mt-6 mb-6">
              <h3 className="text-xl mb-4">{gameEndedWithBomb ? "Game Over - All Bombs Revealed" : "Game Board"}</h3>
              <div 
                className="grid gap-2 justify-center mx-auto"
                style={{ 
                  gridTemplateColumns: 'repeat(6, 1fr)', 
                  maxWidth: '300px',
                  display: 'grid'
                }}
              >
                {tiles.map((tile, i) => {
                  const isRevealed = revealedTiles[i];
                  const isBomb = tile === 2;
                  
                  return (
                    <div
                      key={i}
                      onClick={() => handleTileClick(i)}
                      className={`flex items-center justify-center font-bold text-lg transition-all duration-200 border-2 rounded-md
                        ${!isRevealed 
                          ? "bg-gray-300 text-black cursor-pointer hover:bg-gray-200 active:scale-95 border-gray-500" 
                          : isBomb
                          ? "bg-red-500 text-white animate-bounce border-red-700" 
                          : "bg-green-500 text-white animate-pulse border-green-700"
                        }
                        ${(!gameActive || !isGameControlsEnabled || isRevealed || isTransactionPending) ? "cursor-not-allowed opacity-75" : ""}`}
                      style={{ 
                        width: '45px',
                        height: '45px',
                        pointerEvents: (!gameActive || !isGameControlsEnabled || isRevealed || isTransactionPending) ? 'none' : 'auto' 
                      }}
                    >
                      {isRevealed ? (isBomb ? "💣" : "✅") : i + 1}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {gameActive && (
            <div className="mt-4 p-4 bg-white bg-opacity-20 rounded-lg">
              <p>🎯 Safe Tiles: {tilesClicked}/27</p>
              <p>📈 Current Multiplier: {(calculateMultiplier(tilesClicked) * 0.95).toFixed(4)}x</p>
              <p>💎 Potential Win: {(calculateMultiplier(tilesClicked) * 0.95 * parseFloat(selectedBet)).toFixed(4)} MON</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 space-y-2">
        <p className="text-lg">{status}</p>
        <p>📊 Total Earnings: +{totalEarned.toFixed(4)} MON | Total Losses: -{totalLost.toFixed(4)} MON</p>
        <p className="text-sm opacity-80">
          🎯 Find 27 safe tiles among 36. Avoid 9 bombs. Cash out anytime to secure winnings!
        </p>
      </div>

      {gameError && (
        <div className="mt-4 p-4 bg-red-500 bg-opacity-20 border border-red-300 rounded-lg">
          <p className="text-red-200">❌ Error: {gameErrorText}</p>
          <button 
            onClick={() => {
              setGameError(false);
              setGameErrorText("");
            }}
            className="mt-2 bg-red-500 text-white px-3 py-1 rounded text-sm"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

export default App;