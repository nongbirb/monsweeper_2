import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const mockEntropyAbi = [
  "function getFee(address provider) external view returns (uint128)",
  "function fulfillEntropy(uint64 sequenceNumber) external",
  "function autoFulfillPendingRequests() external",
  "function getRequestStatus(uint64 sequenceNumber) external view returns (bool exists, bool fulfilled, bytes32 randomNumber, uint256 requestTime)",
  "function isReadyToFulfill(uint64 sequenceNumber) external view returns (bool)",
  "function getPendingRequestCount() external view returns (uint256)",
  "function currentSequenceNumber() external view returns (uint64)",
  "event EntropyRequested(uint64 sequenceNumber, address requester)",
  "event EntropyFulfilled(uint64 sequenceNumber, bytes32 randomNumber)"
];

export function MockEntropyHelper({ 
  mockEntropyAddress, 
  publicClient, 
  walletClient, 
  user, 
  gameId 
}) {
  const [pendingRequests, setPendingRequests] = useState(0);
  const [currentSequence, setCurrentSequence] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastFulfillment, setLastFulfillment] = useState(null);

  const contractInterface = new ethers.Interface(mockEntropyAbi);

  // Fetch mock entropy status
  const fetchMockEntropyStatus = async () => {
    if (!publicClient || !mockEntropyAddress) return;

    try {
      const [pendingCount, sequence] = await Promise.all([
        publicClient.readContract({
          address: mockEntropyAddress,
          abi: mockEntropyAbi,
          functionName: 'getPendingRequestCount'
        }),
        publicClient.readContract({
          address: mockEntropyAddress,
          abi: mockEntropyAbi,
          functionName: 'currentSequenceNumber'
        })
      ]);

      setPendingRequests(Number(pendingCount));
      setCurrentSequence(Number(sequence));
    } catch (error) {
      console.error('Failed to fetch mock entropy status:', error);
    }
  };

  // Auto-fulfill pending requests
  const autoFulfillRequests = async () => {
    if (!walletClient || !user?.wallet?.address || !mockEntropyAddress) return;

    try {
      setIsProcessing(true);
      console.log('Auto-fulfilling pending entropy requests...');

      const data = contractInterface.encodeFunctionData("autoFulfillPendingRequests", []);

      const txHash = await walletClient.sendTransaction({
        to: mockEntropyAddress,
        account: user.wallet.address,
        data,
        gas: BigInt(500000),
        value: BigInt(0)
      });

      console.log('Auto-fulfill transaction:', txHash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      
      if (receipt.status === 1n) {
        console.log('Auto-fulfill successful!');
        setLastFulfillment(new Date().toLocaleTimeString());
        
        // Refresh status after a short delay
        setTimeout(() => {
          fetchMockEntropyStatus();
        }, 2000);
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error) {
      console.error('Failed to auto-fulfill requests:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Fulfill specific sequence number
  const fulfillSpecificRequest = async (sequenceNumber) => {
    if (!walletClient || !user?.wallet?.address || !mockEntropyAddress) return;

    try {
      setIsProcessing(true);
      console.log(`Fulfilling entropy request ${sequenceNumber}...`);

      const data = contractInterface.encodeFunctionData("fulfillEntropy", [sequenceNumber]);

      const txHash = await walletClient.sendTransaction({
        to: mockEntropyAddress,
        account: user.wallet.address,
        data,
        gas: BigInt(500000),
        value: BigInt(0)
      });

      console.log('Fulfill transaction:', txHash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      
      if (receipt.status === 1n) {
        console.log(`Entropy request ${sequenceNumber} fulfilled!`);
        setLastFulfillment(new Date().toLocaleTimeString());
        
        // Refresh status after a short delay
        setTimeout(() => {
          fetchMockEntropyStatus();
        }, 2000);
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error) {
      console.error('Failed to fulfill specific request:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Auto-refresh status
  useEffect(() => {
    fetchMockEntropyStatus();
    const interval = setInterval(fetchMockEntropyStatus, 5000);
    return () => clearInterval(interval);
  }, [mockEntropyAddress, publicClient]);

  // Listen for entropy events
  useEffect(() => {
    if (!publicClient || !mockEntropyAddress) return;

    const unwatchRequested = publicClient.watchContractEvent({
      address: mockEntropyAddress,
      abi: mockEntropyAbi,
      eventName: 'EntropyRequested',
      onLogs: (logs) => {
        console.log('🔔 MockEntropy: Entropy requested:', logs);
        logs.forEach(log => {
          try {
            const parsed = contractInterface.parseLog(log);
            if (parsed) {
              console.log('📋 MockEntropy request:', {
                sequenceNumber: parsed.args.sequenceNumber.toString(),
                requester: parsed.args.requester
              });
            }
          } catch (parseError) {
            console.error('Error parsing EntropyRequested log:', parseError);
          }
        });
        // Refresh status when new request comes in
        setTimeout(fetchMockEntropyStatus, 1000);
      }
    });

    const unwatchFulfilled = publicClient.watchContractEvent({
      address: mockEntropyAddress,
      abi: mockEntropyAbi,
      eventName: 'EntropyFulfilled',
      onLogs: (logs) => {
        console.log('✅ MockEntropy: Entropy fulfilled:', logs);
        logs.forEach(log => {
          try {
            const parsed = contractInterface.parseLog(log);
            if (parsed) {
              console.log('🎲 MockEntropy fulfilled:', {
                sequenceNumber: parsed.args.sequenceNumber.toString(),
                randomNumber: parsed.args.randomNumber
              });
            }
          } catch (parseError) {
            console.error('Error parsing EntropyFulfilled log:', parseError);
          }
        });
        // Refresh status when fulfillment happens
        setTimeout(fetchMockEntropyStatus, 1000);
      }
    });

    return () => {
      unwatchRequested();
      unwatchFulfilled();
    };
  }, [mockEntropyAddress, publicClient]);

  if (!mockEntropyAddress) {
    return (
      <div className="p-4 bg-gray-800 border border-gray-600 rounded">
        <h3 className="text-lg font-bold text-gray-400 mb-2">MockEntropy Not Available</h3>
        <p className="text-sm text-gray-500">
          MockEntropy contract address not provided. Deploy the MockEntropy contract first.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-purple-900/40 border border-purple-500/30 rounded">
      <h3 className="text-lg font-bold text-purple-400 mb-3">MockEntropy Helper</h3>
      
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-purple-400">Pending Requests:</p>
            <p className="text-white font-bold">{pendingRequests}</p>
          </div>
          <div>
            <p className="text-purple-400">Current Sequence:</p>
            <p className="text-white font-bold">{currentSequence}</p>
          </div>
        </div>

        {lastFulfillment && (
          <div className="text-sm">
            <p className="text-purple-400">Last Fulfillment:</p>
            <p className="text-green-400">{lastFulfillment}</p>
          </div>
        )}

        <div className="space-y-2">
          <button
            onClick={autoFulfillRequests}
            disabled={isProcessing || pendingRequests === 0}
            className="w-full px-3 py-2 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? 'Processing...' : `Auto-Fulfill All (${pendingRequests})`}
          </button>

          {pendingRequests > 0 && (
            <button
              onClick={() => fulfillSpecificRequest(currentSequence - 1)}
              disabled={isProcessing}
              className="w-full px-3 py-2 bg-orange-600 text-white text-sm rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? 'Processing...' : `Fulfill Latest (#${currentSequence - 1})`}
            </button>
          )}
        </div>

        <div className="text-xs text-purple-400 space-y-1">
          <p>🔧 This is a mock entropy contract for testing</p>
          <p>⏱️ Requests auto-fulfill after 5 seconds</p>
          <p>🎲 Uses block hash + timestamp for randomness</p>
          <p>📍 Contract: {mockEntropyAddress.slice(0, 10)}...</p>
        </div>
      </div>
    </div>
  );
}

export default MockEntropyHelper; 