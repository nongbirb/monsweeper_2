// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockEntropy
 * @dev Mock implementation of Pyth Entropy for testing on networks where Pyth Entropy is not deployed
 * This contract simulates the behavior of Pyth Entropy for development and testing purposes
 */
contract MockEntropy {
    struct PendingRequest {
        address requester;
        bytes32 userCommitment;
        uint256 requestTime;
        bool fulfilled;
        bytes32 randomNumber;
    }

    mapping(uint64 => PendingRequest) public pendingRequests;
    uint64 public currentSequenceNumber = 1;
    uint256 public constant FULFILLMENT_DELAY = 5; // 5 seconds delay to simulate real entropy
    uint128 public constant FIXED_FEE = 0.001 ether; // Fixed fee for testing

    event EntropyRequested(uint64 sequenceNumber, address requester);
    event EntropyFulfilled(uint64 sequenceNumber, bytes32 randomNumber);

    /**
     * @dev Get the fee for entropy request
     */
    function getFee(address /*provider*/) external pure returns (uint128) {
        return FIXED_FEE;
    }

    /**
     * @dev Request entropy with callback
     * @param provider The entropy provider address (ignored in mock)
     * @param userCommitment User's commitment (can be bytes32(0) for simplicity)
     * @return sequenceNumber The sequence number for this request
     */
    function requestWithCallback(
        address provider,
        bytes32 userCommitment
    ) external payable returns (uint64 sequenceNumber) {
        require(msg.value >= FIXED_FEE, "Insufficient fee");

        sequenceNumber = currentSequenceNumber++;
        
        pendingRequests[sequenceNumber] = PendingRequest({
            requester: msg.sender,
            userCommitment: userCommitment,
            requestTime: block.timestamp,
            fulfilled: false,
            randomNumber: bytes32(0)
        });

        emit EntropyRequested(sequenceNumber, msg.sender);
        
        // Auto-fulfill after delay (simulating Pyth's callback)
        _scheduleFulfillment(sequenceNumber);
        
        return sequenceNumber;
    }

    /**
     * @dev Internal function to schedule fulfillment
     * In a real implementation, this would be handled by Pyth's infrastructure
     */
    function _scheduleFulfillment(uint64 sequenceNumber) internal {
        // In a real scenario, we'd use a keeper or external service
        // For testing, we'll allow manual fulfillment or auto-fulfill
        // This is a simplified mock - real Pyth Entropy has more complex mechanisms
    }

    /**
     * @dev Manually fulfill entropy request (for testing purposes)
     * In real Pyth Entropy, this is done automatically by the network
     */
    function fulfillEntropy(uint64 sequenceNumber) external {
        PendingRequest storage request = pendingRequests[sequenceNumber];
        require(request.requester != address(0), "Invalid sequence number");
        require(!request.fulfilled, "Already fulfilled");
        require(block.timestamp >= request.requestTime + FULFILLMENT_DELAY, "Too early to fulfill");

        // Generate pseudo-random number using block properties
        bytes32 randomNumber = keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            sequenceNumber,
            request.userCommitment,
            request.requester
        ));

        request.fulfilled = true;
        request.randomNumber = randomNumber;

        emit EntropyFulfilled(sequenceNumber, randomNumber);

        // Call the callback function on the requester
        _callbackToRequester(request.requester, sequenceNumber, randomNumber);
    }

    /**
     * @dev Call the entropy callback on the requesting contract
     */
    function _callbackToRequester(address requester, uint64 sequenceNumber, bytes32 randomNumber) internal {
        // Call the entropyCallback function on the requesting contract
        (bool success, ) = requester.call(
            abi.encodeWithSignature(
                "entropyCallback(uint64,address,bytes32)",
                sequenceNumber,
                address(this), // provider address
                randomNumber
            )
        );
        
        // Don't revert if callback fails - just log
        if (!success) {
            // In a real implementation, you might want to handle callback failures
            // For testing, we'll just continue
        }
    }

    /**
     * @dev Auto-fulfill all pending requests that are ready
     * This is a helper function for testing - call this to simulate Pyth's automatic fulfillment
     */
    function autoFulfillPendingRequests() external {
        for (uint64 i = 1; i < currentSequenceNumber; i++) {
            PendingRequest storage request = pendingRequests[i];
            if (request.requester != address(0) && 
                !request.fulfilled && 
                block.timestamp >= request.requestTime + FULFILLMENT_DELAY) {
                
                bytes32 randomNumber = keccak256(abi.encodePacked(
                    block.timestamp,
                    block.prevrandao,
                    i,
                    request.userCommitment,
                    request.requester
                ));

                request.fulfilled = true;
                request.randomNumber = randomNumber;

                emit EntropyFulfilled(i, randomNumber);
                _callbackToRequester(request.requester, i, randomNumber);
            }
        }
    }

    /**
     * @dev Get the status of a pending request
     */
    function getRequestStatus(uint64 sequenceNumber) external view returns (
        bool exists,
        bool fulfilled,
        bytes32 randomNumber,
        uint256 requestTime
    ) {
        PendingRequest storage request = pendingRequests[sequenceNumber];
        exists = request.requester != address(0);
        fulfilled = request.fulfilled;
        randomNumber = request.randomNumber;
        requestTime = request.requestTime;
    }

    /**
     * @dev Check if a request is ready to be fulfilled
     */
    function isReadyToFulfill(uint64 sequenceNumber) external view returns (bool) {
        PendingRequest storage request = pendingRequests[sequenceNumber];
        return request.requester != address(0) && 
               !request.fulfilled && 
               block.timestamp >= request.requestTime + FULFILLMENT_DELAY;
    }

    /**
     * @dev Get count of pending unfulfilled requests
     */
    function getPendingRequestCount() external view returns (uint256 count) {
        for (uint64 i = 1; i < currentSequenceNumber; i++) {
            PendingRequest storage request = pendingRequests[i];
            if (request.requester != address(0) && !request.fulfilled) {
                count++;
            }
        }
    }

    /**
     * @dev Withdraw accumulated fees (for testing)
     */
    function withdrawFees() external {
        payable(msg.sender).transfer(address(this).balance);
    }

    /**
     * @dev Get contract balance
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
} 