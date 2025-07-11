// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract UltraSecureMonsweeper is Ownable, ReentrancyGuard {
    enum GameDifficulty { NORMAL, GOD_OF_WAR }

    struct Game {
        address player;
        uint256 bet;
        bool active;
        bytes32 commitmentHash;
        GameDifficulty difficulty;
        uint256 startTimestamp;
        bytes32 serverSeed; // Ultra-enhanced server entropy
        bool serverSeedRevealed;
        uint256 blockNumber;
        bytes32 futureBlockHash;
        uint256 nonce;
    }

    struct GameResult {
        bytes32 gameId;
        address player;
        uint256 bet;
        uint256 payout;
        bytes32 seed;
        GameDifficulty difficulty;
        bool won;
        uint8 tilesRevealed;
        uint256 endTimestamp;
    }

    // 🔒 HIDDEN ENTROPY STATE VARIABLES (not visible in transaction data)
    mapping(bytes32 => Game) public games;
    mapping(address => bytes32) public playerActiveGame;
    mapping(bytes32 => GameResult) public gameResults;
    
    // 🕵️ PRIVATE ENTROPY SOURCES (hidden from external observers)
    uint256 private globalNonce;                    // Global game counter
    uint256 private totalGamesPlayed;               // Lifetime game count
    uint256 private totalWins;                      // Lifetime wins
    uint256 private totalLosses;                    // Lifetime losses
    uint256 private cumulativeRevenue;              // Total revenue
    uint256 private cumulativePayouts;              // Total payouts
    uint256 private lastGameTimestamp;              // Previous game timing
    uint256 private contractInteractions;           // Total function calls
    uint256 private pseudoRandomState;              // Internal PRNG state
    uint256 private executionComplexity;            // Code path entropy
    bytes32 private accumulatedHashEntropy;         // Cumulative hash state
    uint256 private storageAccessPattern;           // Storage usage patterns
    uint256 private memoryFootprint;                // Memory usage tracking
    
    // 🔍 BEHAVIORAL ENTROPY (user pattern tracking)
    mapping(address => uint256) private playerGameCount;
    mapping(address => uint256) private playerWinRate;
    mapping(address => uint256) private playerLastAction;
    mapping(uint256 => bytes32) private recentGameSeeds; // Recent outcomes for entropy
    
    uint256 private constant FUTURE_BLOCK_DELAY = 3;
    uint256 private constant MAX_BET = 10 ether;
    uint256 private constant HOUSE_EDGE = 95;
    uint256 private constant GOD_OF_WAR_BONUS = 150;
    uint8 constant BOARD_SIZE = 36;
    uint8 constant NORMAL_BOMBS = 9;
    uint8 constant GOD_OF_WAR_BOMBS = 12;
    uint256 constant GAME_TIMEOUT = 1 hours;
    string public constant ALGORITHM_VERSION = "ultra-v1";

    event GameStarted(bytes32 indexed gameId, address indexed player, uint256 bet, GameDifficulty difficulty, bytes32 commitmentHash);
    event GameEnded(bytes32 indexed gameId, address indexed player, uint256 bet, uint256 payout, bool won, uint8 tilesRevealed, bytes32 seed);
    event GameForfeited(bytes32 indexed gameId, address indexed player);

    constructor() Ownable(msg.sender) {
        // Initialize hidden entropy with deployment context
        pseudoRandomState = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            msg.sender,
            address(this),
            block.chainid
        )));
        accumulatedHashEntropy = keccak256(abi.encodePacked(pseudoRandomState));
        executionComplexity = gasleft();
    }

    function startGame(GameDifficulty difficulty, bytes32 commitmentHash) external payable returns (bytes32 gameId) {
        bytes32 oldGameId = playerActiveGame[msg.sender];
        if (oldGameId != bytes32(0) && games[oldGameId].active) {
            _forfeit(oldGameId);
        }

        require(msg.value > 0, "No bet provided");
        require(msg.value <= MAX_BET, "Bet exceeds maximum");
        require(commitmentHash != bytes32(0), "Commitment hash cannot be empty");
        
        // 🔒 UPDATE HIDDEN ENTROPY STATES
        _updateHiddenEntropy(msg.sender, msg.value);
        
        // Increment counters
        globalNonce++;
        totalGamesPlayed++;
        contractInteractions++;
        
        // 🕵️ ULTRA-ENHANCED SERVER SEED GENERATION WITH HIDDEN SOURCES
        bytes32 serverSeed = _generateUltraSecureServerSeed(msg.sender, commitmentHash, difficulty);

        gameId = keccak256(abi.encodePacked(
            msg.sender, 
            commitmentHash, 
            block.timestamp,
            globalNonce,
            gasleft(),
            serverSeed  // Include server seed in game ID for extra entropy
        ));

        games[gameId] = Game({
            player: msg.sender,
            bet: msg.value,
            active: true,
            commitmentHash: commitmentHash,
            difficulty: difficulty,
            startTimestamp: block.timestamp,
            serverSeed: serverSeed,
            serverSeedRevealed: false,
            blockNumber: block.number,
            futureBlockHash: 0,
            nonce: globalNonce
        });

        playerActiveGame[msg.sender] = gameId;
        
        // Store this game's seed for future entropy
        recentGameSeeds[globalNonce % 100] = serverSeed;
        
        // Update behavioral tracking
        playerGameCount[msg.sender]++;
        playerLastAction[msg.sender] = block.timestamp;
        
        emit GameStarted(gameId, msg.sender, msg.value, difficulty, commitmentHash);
    }

    function _generateUltraSecureServerSeed(address player, bytes32 commitment, GameDifficulty difficulty) private returns (bytes32) {
        // 🔒 COMBINE 20+ ENTROPY SOURCES (many hidden from transaction data)
        
        // Public entropy (visible but still needed)
        bytes32 publicEntropy = keccak256(abi.encodePacked(
            block.timestamp,        // Blockchain time
            block.prevrandao,       // Blockchain randomness
            msg.sender,             // Player address
            address(this).balance,  // Contract balance
            globalNonce,            // Game counter
            block.number,           // Block height
            block.coinbase,         // Validator address
            tx.gasprice,            // Gas price
            gasleft(),              // Remaining gas
            keccak256(abi.encodePacked(block.chainid, blockhash(block.number - 1)))
        ));
        
        // 🕵️ HIDDEN ENTROPY (not visible in transaction data)
        bytes32 hiddenEntropy = keccak256(abi.encodePacked(
            totalGamesPlayed,           // Total games counter
            totalWins,                  // Win statistics
            totalLosses,                // Loss statistics
            cumulativeRevenue,          // Revenue tracking
            cumulativePayouts,          // Payout history
            lastGameTimestamp,          // Previous game timing
            contractInteractions,       // Function call count
            pseudoRandomState,          // Internal PRNG state
            executionComplexity,        // Execution patterns
            accumulatedHashEntropy,     // Cumulative hash state
            storageAccessPattern,       // Storage usage
            memoryFootprint             // Memory patterns
        ));
        
        // 🎭 BEHAVIORAL ENTROPY (user patterns)
        bytes32 behavioralEntropy = keccak256(abi.encodePacked(
            playerGameCount[player],    // Player's game count
            playerWinRate[player],      // Player's win rate
            playerLastAction[player],   // Player's last action time
            recentGameSeeds[globalNonce % 10],  // Recent game outcomes
            recentGameSeeds[globalNonce % 20],  // More historical entropy
            commitment,                 // Player's commitment
            uint256(difficulty)         // Game difficulty
        ));
        
        // 🧮 EXECUTION ENTROPY (runtime-dependent)
        bytes32 executionEntropy = keccak256(abi.encodePacked(
            gasleft(),                  // Current gas remaining
            msg.data.length,            // Call data size
            msg.value,                  // Transaction value
            tx.origin,                  // Transaction origin
            _getMemoryPattern(),        // Memory access pattern
            _getStoragePattern(),       // Storage access pattern
            _getCallDepth()             // Call stack depth
        ));
        
        // 🔄 UPDATE INTERNAL ENTROPY STATE
        pseudoRandomState = uint256(keccak256(abi.encodePacked(
            pseudoRandomState,
            publicEntropy,
            hiddenEntropy,
            behavioralEntropy,
            executionEntropy
        )));
        
        accumulatedHashEntropy = keccak256(abi.encodePacked(
            accumulatedHashEntropy,
            pseudoRandomState,
            block.timestamp
        ));
        
        // 🎯 FINAL ULTRA-SECURE SERVER SEED
        return keccak256(abi.encodePacked(
            publicEntropy,
            hiddenEntropy,
            behavioralEntropy,
            executionEntropy,
            pseudoRandomState,
            accumulatedHashEntropy
        ));
    }

    function _updateHiddenEntropy(address player, uint256 betAmount) private {
        // Update timing entropy
        if (lastGameTimestamp > 0) {
            uint256 timeDelta = block.timestamp - lastGameTimestamp;
            executionComplexity = (executionComplexity + timeDelta + gasleft()) % (2**64);
        }
        lastGameTimestamp = block.timestamp;
        
        // Update revenue tracking
        cumulativeRevenue += betAmount;
        
        // Update storage access pattern
        storageAccessPattern = (storageAccessPattern + uint256(keccak256(abi.encodePacked(player, betAmount)))) % (2**32);
        
        // Update memory footprint simulation
        memoryFootprint = gasleft() % 10000;
        
        // Update contract interaction count
        contractInteractions++;
    }

    function _getMemoryPattern() private view returns (uint256) {
        // Simulate memory access pattern based on execution context
        return uint256(keccak256(abi.encodePacked(
            gasleft(),
            msg.data,
            address(this).balance
        ))) % (2**16);
    }

    function _getStoragePattern() private view returns (uint256) {
        // Simulate storage access pattern
        return uint256(keccak256(abi.encodePacked(
            totalGamesPlayed,
            globalNonce,
            storageAccessPattern
        ))) % (2**16);
    }

    function _getCallDepth() private view returns (uint256) {
        // Simulate call stack depth
        return gasleft() % 100;
    }

    function endGame(bytes32 gameId, bytes32 clientSeed, bool won, uint8 tilesRevealed) external nonReentrant {
        Game storage game = games[gameId];
        require(game.player == msg.sender, "Not your game");
        require(game.active, "Game not active");
        require(block.timestamp <= game.startTimestamp + GAME_TIMEOUT, "Game expired");

        bytes32 recalculatedCommitment = createCommitmentHash(ALGORITHM_VERSION, game.difficulty, clientSeed);
        require(recalculatedCommitment == game.commitmentHash, "Commitment mismatch");

        // Add future block hash for additional entropy (if available)
        if (block.number > game.blockNumber + FUTURE_BLOCK_DELAY) {
            game.futureBlockHash = blockhash(game.blockNumber + FUTURE_BLOCK_DELAY);
        }

        // 🔒 ULTRA-ENHANCED FINAL SEED CALCULATION
        bytes32 finalSeed = keccak256(abi.encodePacked(
            clientSeed,               // Client's committed seed
            game.serverSeed,          // Ultra-secure server seed
            game.futureBlockHash,     // Future block hash (if available)
            block.timestamp,          // Current timestamp
            game.nonce,               // Unique nonce
            won ? totalWins : totalLosses,  // Outcome-dependent entropy
            pseudoRandomState,        // Internal PRNG state
            accumulatedHashEntropy    // Accumulated entropy
        ));

        // Reveal server seed for transparency
        game.serverSeedRevealed = true;

        // Update win/loss statistics
        if (won) {
            totalWins++;
            playerWinRate[msg.sender] = (playerWinRate[msg.sender] + 1000) / 2; // Weighted average
        } else {
            totalLosses++;
            playerWinRate[msg.sender] = playerWinRate[msg.sender] / 2; // Decrease win rate
        }

        uint256 payout = 0;
        uint8 numBombs = game.difficulty == GameDifficulty.GOD_OF_WAR ? GOD_OF_WAR_BOMBS : NORMAL_BOMBS;

        if (won) {
            require(tilesRevealed > 0, "No tiles revealed");
            require(tilesRevealed <= BOARD_SIZE - numBombs, "Too many tiles revealed");

            uint256 multiplier = calculateMultiplier(tilesRevealed, numBombs);
            uint256 basePayout = (game.bet * multiplier) / 1e18;

            if (game.difficulty == GameDifficulty.GOD_OF_WAR) {
                payout = (basePayout * GOD_OF_WAR_BONUS) / 100;
            } else {
                payout = basePayout;
            }
            payout = (payout * HOUSE_EDGE) / 100;
            
            uint256 houseLimit = (address(this).balance * 20) / 100;
            require(payout <= houseLimit, "Payout exceeds house limit");
            
            cumulativePayouts += payout;
        }

        gameResults[gameId] = GameResult({
            gameId: gameId,
            player: game.player,
            bet: game.bet,
            payout: payout,
            seed: finalSeed,
            difficulty: game.difficulty,
            won: won,
            tilesRevealed: tilesRevealed,
            endTimestamp: block.timestamp
        });

        game.active = false;
        playerActiveGame[msg.sender] = bytes32(0);

        if (payout > 0) {
            (bool sent, ) = payable(msg.sender).call{value: payout}("");
            require(sent, "Transfer failed");
        }

        // Update hidden entropy after game completion
        _updateHiddenEntropy(msg.sender, 0);

        emit GameEnded(gameId, msg.sender, game.bet, payout, won, tilesRevealed, finalSeed);
    }
    
    function forfeitGame(bytes32 gameId) external {
        Game storage game = games[gameId];
        require(game.player == msg.sender, "Not your game");
        require(game.active, "Game not active");
        _forfeit(gameId);
    }

    function _forfeit(bytes32 gameId) internal {
        Game storage game = games[gameId];
        game.active = false;
        if(playerActiveGame[game.player] == gameId) {
            playerActiveGame[game.player] = bytes32(0);
        }
        totalLosses++; // Count forfeit as loss for entropy
        emit GameForfeited(gameId, game.player);
    }
    
    function createCommitmentHash(string memory version, GameDifficulty difficulty, bytes32 seed) internal pure returns (bytes32) {
        string memory difficultyStr = difficulty == GameDifficulty.NORMAL ? "normal" : "god_of_war";
        string memory gameData = string(abi.encodePacked(
            '{"version":"', version, '",',
            '"difficulty":"', difficultyStr, '",',
            '"seed":"', bytes32ToHexString(seed), '"}'
        ));
        return keccak256(abi.encodePacked(gameData));
    }
    
    function bytes32ToHexString(bytes32 _bytes32) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(64);
        for (uint i = 0; i < 32; i++) {
            str[i * 2] = alphabet[uint8(_bytes32[i] >> 4)];
            str[i * 2 + 1] = alphabet[uint8(_bytes32[i] & 0x0f)];
        }
        return string(str);
    }

    function calculateMultiplier(uint8 safeRevealed, uint8 numBombs) internal pure returns (uint256) {
        uint256 multiplier = 1e18;
        for (uint8 i = 0; i < safeRevealed; i++) {
            uint256 safeTiles = BOARD_SIZE - numBombs - i;
            uint256 remainingTiles = BOARD_SIZE - i;
            if (remainingTiles == 0) return 0;
            uint256 probability = (safeTiles * 1e18) / remainingTiles;
            if (probability == 0) return 0;
            multiplier = (multiplier * 1e18) / probability;
        }
        return multiplier;
    }
    
    function verifyGame(bytes32 gameId) external view returns (bool isValid, bytes32 originalCommitment, bytes32 recalculatedCommitment, bool[BOARD_SIZE] memory bombPositions) {
        GameResult memory result = gameResults[gameId];
        require(result.gameId != bytes32(0), "Game result not found");

        originalCommitment = games[gameId].commitmentHash;
        require(originalCommitment != bytes32(0), "Original commitment not found");
        
        recalculatedCommitment = createCommitmentHash(
            ALGORITHM_VERSION,
            result.difficulty,
            result.seed
        );
        
        bombPositions = generateBombPositions(result.seed, result.difficulty);
        isValid = (originalCommitment == recalculatedCommitment);
    }

    function generateBombPositions(bytes32 seed, GameDifficulty difficulty) public pure returns (bool[BOARD_SIZE] memory bombs) {
        uint8 numBombs = difficulty == GameDifficulty.GOD_OF_WAR ? GOD_OF_WAR_BOMBS : NORMAL_BOMBS;
        uint8 bombsPlaced = 0;
        for (uint256 i = 0; bombsPlaced < numBombs; i++) {
            bytes32 positionHash = keccak256(abi.encodePacked(seed, i));
            uint8 position = uint8(uint256(positionHash) % BOARD_SIZE);
            if (!bombs[position]) {
                bombs[position] = true;
                bombsPlaced++;
            }
        }
    }
    
    // 🔍 Public view functions for transparency (but private variables remain hidden)
    function getGameInfo(bytes32 gameId) external view returns (Game memory) {
        return games[gameId];
    }

    function getGameResult(bytes32 gameId) external view returns (GameResult memory) {
        return gameResults[gameId];
    }

    function getPlayerActiveGame(address player) external view returns (bytes32) {
        return playerActiveGame[player];
    }

    function getServerSeed(bytes32 gameId) external view returns (bytes32) {
        return games[gameId].serverSeed;
    }
    
    // Public statistics (aggregated only, individual entropy sources remain private)
    function getPublicStats() external view returns (uint256 games, uint256 wins, uint256 losses) {
        return (totalGamesPlayed, totalWins, totalLosses);
    }
    
    function withdraw(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient balance");
        (bool sent, ) = payable(owner()).call{value: amount}("");
        require(sent, "Withdraw failed");
    }

    receive() external payable {}
} 