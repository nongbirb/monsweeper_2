// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SecureMonsweeper_Enhanced {
    
    struct Game {
        address player;
        uint256 bet;
        bool active;
        bytes32 commitmentHash;
        uint8 difficulty;
        uint256 startTimestamp;
        bytes32 serverSeed;
        bool serverSeedRevealed;
        uint256 blockNumber;      // NEW: Block number for additional entropy
        bytes32 futureBlockHash;  // NEW: Future block hash for unpredictability
        uint256 nonce;           // NEW: Global nonce for uniqueness
    }
    
    mapping(bytes32 => Game) public games;
    mapping(address => bytes32) public activeGames;
    
    uint256 private globalNonce;  // Incremented with each game
    uint256 private constant FUTURE_BLOCK_DELAY = 3; // Wait 3 blocks for future entropy
    
    event GameStarted(bytes32 indexed gameId, address indexed player, uint256 bet, uint8 difficulty, bytes32 commitmentHash);
    event GameEnded(bytes32 indexed gameId, address indexed player, uint256 bet, uint256 payout, bool won, uint8 tilesRevealed, bytes32 seed);
    
    function startGame(uint8 difficulty, bytes32 commitmentHash) external payable returns (bytes32) {
        require(msg.value > 0, "Must send bet");
        require(difficulty <= 1, "Invalid difficulty");
        require(activeGames[msg.sender] == 0, "Already has active game");
        
        // Increment global nonce for uniqueness
        globalNonce++;
        
        // Generate game ID with enhanced entropy
        bytes32 gameId = keccak256(abi.encodePacked(
            block.timestamp,
            msg.sender,
            blockhash(block.number - 1),
            msg.value,
            globalNonce,
            gasleft()  // Gas remaining adds unpredictability
        ));
        
        // Enhanced server seed generation
        bytes32 serverSeed = keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            msg.sender,
            gameId,
            address(this).balance,
            globalNonce,
            block.number,
            block.coinbase,        // Miner address
            tx.gasprice,           // Gas price
            gasleft(),             // Gas remaining
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
            futureBlockHash: 0,  // Will be set later
            nonce: globalNonce
        });
        
        activeGames[msg.sender] = gameId;
        
        emit GameStarted(gameId, msg.sender, msg.value, difficulty, commitmentHash);
        return gameId;
    }
    
    function endGame(bytes32 gameId, bytes32 clientSeed, bool won, uint8 tilesRevealed) external {
        Game storage game = games[gameId];
        require(game.player == msg.sender, "Not your game");
        require(game.active, "Game not active");
        
        // Verify commitment
        string memory difficultyStr = game.difficulty == 0 ? "normal" : "god_of_war";
        bytes32 expectedCommitment = keccak256(abi.encodePacked(
            difficultyStr,
            clientSeed
        ));
        require(game.commitmentHash == expectedCommitment, "Invalid commitment");
        
        // Add future block hash for additional entropy (if available)
        if (block.number > game.blockNumber + FUTURE_BLOCK_DELAY) {
            game.futureBlockHash = blockhash(game.blockNumber + FUTURE_BLOCK_DELAY);
        }
        
        // Enhanced final seed calculation
        bytes32 finalSeed = keccak256(abi.encodePacked(
            clientSeed,
            game.serverSeed,
            game.futureBlockHash,  // Future block hash adds unpredictability
            block.timestamp,       // Current timestamp
            game.nonce
        ));
        
        // Mark server seed as revealed
        game.serverSeedRevealed = true;
        
        // Calculate payout
        uint256 payout = 0;
        if (won && tilesRevealed > 0) {
            uint8 numBombs = game.difficulty == 1 ? 12 : 9;
            uint256 multiplier = calculateMultiplier(tilesRevealed, numBombs);
            uint256 bonusMultiplier = game.difficulty == 1 ? 150 : 100;
            payout = (game.bet * multiplier * bonusMultiplier * 95) / 10000;
        }
        
        // End game
        game.active = false;
        delete activeGames[msg.sender];
        
        // Pay out
        if (payout > 0) {
            payable(msg.sender).transfer(payout);
        }
        
        emit GameEnded(gameId, msg.sender, game.bet, payout, won, tilesRevealed, finalSeed);
    }
    
    function getGameInfo(bytes32 gameId) external view returns (Game memory) {
        return games[gameId];
    }
    
    function getServerSeed(bytes32 gameId) external view returns (bytes32) {
        Game memory game = games[gameId];
        require(game.serverSeedRevealed, "Server seed not revealed");
        return game.serverSeed;
    }
    
    function calculateMultiplier(uint8 tilesRevealed, uint8 numBombs) internal pure returns (uint256) {
        uint256 multiplier = 10000; // Start with 1.0000 (in basis points)
        
        for (uint8 i = 0; i < tilesRevealed; i++) {
            uint8 safeTiles = 36 - numBombs - i;
            uint8 remainingTiles = 36 - i;
            multiplier = (multiplier * remainingTiles) / safeTiles;
        }
        
        return multiplier;
    }
} 