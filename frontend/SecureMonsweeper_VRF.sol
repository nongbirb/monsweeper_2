// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";

contract SecureMonsweeper is VRFConsumerBaseV2 {
    VRFCoordinatorV2Interface COORDINATOR;
    
    // Chainlink VRF Configuration
    bytes32 keyHash;
    uint64 subscriptionId;
    uint32 callbackGasLimit = 100000;
    uint16 requestConfirmations = 3;
    uint32 numWords = 1;
    
    struct Game {
        address player;
        uint256 bet;
        bool active;
        bytes32 commitmentHash;
        uint8 difficulty;
        uint256 startTimestamp;
        bytes32 clientSeed;
        uint256 vrfRequestId;  // VRF request ID
        bytes32 vrfRandomness; // VRF result
        bool serverSeedRevealed;
    }
    
    mapping(bytes32 => Game) public games;
    mapping(address => bytes32) public activeGames;
    mapping(uint256 => bytes32) public vrfRequestToGameId; // VRF request to game mapping
    
    event GameStarted(bytes32 indexed gameId, address indexed player, uint256 bet, uint8 difficulty, bytes32 commitmentHash);
    event VRFRequested(bytes32 indexed gameId, uint256 vrfRequestId);
    event VRFReceived(bytes32 indexed gameId, uint256 vrfRandomness);
    event GameEnded(bytes32 indexed gameId, address indexed player, uint256 bet, uint256 payout, bool won, uint8 tilesRevealed, bytes32 seed);
    
    constructor(
        address vrfCoordinatorV2,
        bytes32 _keyHash,
        uint64 _subscriptionId
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        COORDINATOR = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        keyHash = _keyHash;
        subscriptionId = _subscriptionId;
    }
    
    function startGame(uint8 difficulty, bytes32 commitmentHash) external payable returns (bytes32) {
        require(msg.value > 0, "Must send bet");
        require(difficulty <= 1, "Invalid difficulty");
        require(activeGames[msg.sender] == 0, "Already has active game");
        
        // Generate unique game ID
        bytes32 gameId = keccak256(abi.encodePacked(
            block.timestamp,
            msg.sender,
            blockhash(block.number - 1),
            msg.value
        ));
        
        // Create game with pending VRF
        games[gameId] = Game({
            player: msg.sender,
            bet: msg.value,
            active: true,
            commitmentHash: commitmentHash,
            difficulty: difficulty,
            startTimestamp: block.timestamp,
            clientSeed: 0, // Will be set when game ends
            vrfRequestId: 0, // Will be set when VRF requested
            vrfRandomness: 0, // Will be set when VRF received
            serverSeedRevealed: false
        });
        
        activeGames[msg.sender] = gameId;
        
        // Request randomness from Chainlink VRF
        uint256 requestId = COORDINATOR.requestRandomWords(
            keyHash,
            subscriptionId,
            requestConfirmations,
            callbackGasLimit,
            numWords
        );
        
        games[gameId].vrfRequestId = requestId;
        vrfRequestToGameId[requestId] = gameId;
        
        emit GameStarted(gameId, msg.sender, msg.value, difficulty, commitmentHash);
        emit VRFRequested(gameId, requestId);
        
        return gameId;
    }
    
    // Chainlink VRF callback - called when randomness is received
    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
        bytes32 gameId = vrfRequestToGameId[requestId];
        require(gameId != 0, "Invalid VRF request");
        
        Game storage game = games[gameId];
        game.vrfRandomness = bytes32(randomWords[0]);
        
        emit VRFReceived(gameId, randomWords[0]);
    }
    
    function endGame(bytes32 gameId, bytes32 clientSeed, bool won, uint8 tilesRevealed) external {
        Game storage game = games[gameId];
        require(game.player == msg.sender, "Not your game");
        require(game.active, "Game not active");
        require(game.vrfRandomness != 0, "VRF not received yet");
        
        // Verify commitment
        bytes32 expectedCommitment = keccak256(abi.encodePacked(
            game.difficulty == 0 ? "normal" : "god_of_war",
            clientSeed
        ));
        require(game.commitmentHash == expectedCommitment, "Invalid commitment");
        
        // Store client seed and reveal server seed
        game.clientSeed = clientSeed;
        game.serverSeedRevealed = true;
        
        // Calculate final seed using VRF randomness
        bytes32 finalSeed = keccak256(abi.encodePacked(clientSeed, game.vrfRandomness));
        
        // Calculate payout
        uint256 payout = 0;
        if (won && tilesRevealed > 0) {
            uint8 numBombs = game.difficulty == 1 ? 12 : 9;
            uint256 multiplier = calculateMultiplier(tilesRevealed, numBombs);
            payout = (game.bet * multiplier * (game.difficulty == 1 ? 150 : 100)) / 10000;
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
        return game.vrfRandomness;
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