// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SecureMonsweeper is Ownable, ReentrancyGuard {
    enum GameDifficulty { NORMAL, GOD_OF_WAR }

    struct Game {
        address player;
        uint256 bet;
        bool active;
        bytes32 commitmentHash;
        GameDifficulty difficulty;
        uint256 startTimestamp;
        bytes32 serverSeed; // Enhanced server entropy
        bool serverSeedRevealed;
        uint256 blockNumber;      // NEW: Block number for additional entropy
        bytes32 futureBlockHash;  // NEW: Future block hash for unpredictability
        uint256 nonce;           // NEW: Global nonce for uniqueness
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

    mapping(bytes32 => Game) public games;
    mapping(address => bytes32) public playerActiveGame;
    mapping(bytes32 => GameResult) public gameResults;

    uint256 private globalNonce;  // Incremented with each game for uniqueness
    uint256 private constant FUTURE_BLOCK_DELAY = 3; // Wait 3 blocks for future entropy

    uint8 constant BOARD_SIZE = 36;
    uint8 constant NORMAL_BOMBS = 9;
    uint8 constant GOD_OF_WAR_BOMBS = 12;
    uint256 constant GAME_TIMEOUT = 1 hours;
    uint256 constant MAX_BET = 10 ether;
    uint256 constant HOUSE_EDGE = 95; // 5% house edge
    uint256 constant GOD_OF_WAR_BONUS = 150; // 1.5x bonus
    
    string public constant ALGORITHM_VERSION = "v1";

    event GameStarted(bytes32 indexed gameId, address indexed player, uint256 bet, GameDifficulty difficulty, bytes32 commitmentHash);
    event GameEnded(bytes32 indexed gameId, address indexed player, uint256 bet, uint256 payout, bool won, uint8 tilesRevealed, bytes32 seed);
    event GameForfeited(bytes32 indexed gameId, address indexed player);

    constructor() Ownable(msg.sender) {}

    function startGame(GameDifficulty difficulty, bytes32 commitmentHash) external payable returns (bytes32 gameId) {
        bytes32 oldGameId = playerActiveGame[msg.sender];
        if (oldGameId != bytes32(0) && games[oldGameId].active) {
            _forfeit(oldGameId);
        }

        require(msg.value > 0, "No bet provided");
        require(msg.value <= MAX_BET, "Bet exceeds maximum");
        require(commitmentHash != bytes32(0), "Commitment hash cannot be empty");
        
        // Increment global nonce for uniqueness
        globalNonce++;
        
        // Generate game ID with enhanced entropy
        gameId = keccak256(abi.encodePacked(
            msg.sender, 
            commitmentHash, 
            block.timestamp,
            globalNonce,
            gasleft()  // Gas remaining adds unpredictability
        ));
        
        // 🔒 ENHANCED SERVER SEED GENERATION
        bytes32 serverSeed = keccak256(abi.encodePacked(
            block.timestamp,        // Current block timestamp
            block.prevrandao,       // Blockchain randomness
            msg.sender,             // Player address
            gameId,                 // Unique game identifier
            address(this).balance,  // Contract balance
            globalNonce,            // Global unique counter
            block.number,           // Current block number
            block.coinbase,         // Miner address (validator)
            tx.gasprice,            // Gas price for this transaction
            gasleft(),              // Gas remaining at this point
            keccak256(abi.encodePacked(block.chainid, blockhash(block.number - 1)))
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
            futureBlockHash: 0,  // Will be set later for additional entropy
            nonce: globalNonce
        });

        playerActiveGame[msg.sender] = gameId;

        emit GameStarted(gameId, msg.sender, msg.value, difficulty, commitmentHash);
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

        // 🔒 ENHANCED FINAL SEED CALCULATION
        bytes32 finalSeed = keccak256(abi.encodePacked(
            clientSeed,               // Client's committed seed
            game.serverSeed,          // Enhanced server seed
            game.futureBlockHash,     // Future block hash (if available)
            block.timestamp,          // Current timestamp for additional entropy
            game.nonce                // Unique nonce for this game
        ));

        // Reveal server seed for transparency
        game.serverSeedRevealed = true;

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
        }

        gameResults[gameId] = GameResult({
            gameId: gameId,
            player: game.player,
            bet: game.bet,
            payout: payout,
            seed: finalSeed, // Store combined seed
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
            if (remainingTiles == 0) return 0; // Should not happen
            uint256 probability = (safeTiles * 1e18) / remainingTiles;
            if (probability == 0) return 0; // Should not happen with sane inputs
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
    
    function withdraw(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient balance");
        (bool sent, ) = payable(owner()).call{value: amount}("");
        require(sent, "Withdraw failed");
    }

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

    receive() external payable {}
}
