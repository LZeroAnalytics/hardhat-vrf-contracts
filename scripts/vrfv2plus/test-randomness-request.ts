// scripts/request-randomness.ts
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

task("request-randomness", "Request randomness from a VRF consumer contract")
  .addParam("consumer", "Address of the VRF consumer contract")
  .addParam("subid", "Subscription ID")
  .addOptionalParam("numwords", "Number of random words to request", "1")
  .addOptionalParam("confirmations", "Number of confirmations for VRF request", "3")
  .addOptionalParam("callbackgas", "Gas limit for callback", "100000")
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    try {
      console.log(`Requesting randomness from consumer: ${taskArgs.consumer}`);
      console.log(`Subscription ID: ${taskArgs.subid}`);
      
      // Parse numeric parameters
      const subId = BigInt(taskArgs.subid);
      const numWords = parseInt(taskArgs.numwords);
      const minConfirmations = parseInt(taskArgs.confirmations);
      const callbackGasLimit = parseInt(taskArgs.callbackgas);
      
      // Load consumer contract
      const consumer = await hre.ethers.getContractAt("VRFConsumerV2Plus", taskArgs.consumer);
      
      // Request randomness
      console.log(`Requesting ${numWords} random words...`);
      console.log(`Minimum confirmations: ${minConfirmations}`);
      console.log(`Callback gas limit: ${callbackGasLimit}`);
      
      const coordinator = await hre.ethers.getContractAt("VRFCoordinatorV2_5", taskArgs.coordinator);

      const keyHash = await coordinator.s_provingKeyHashes(0)
      const tx = await consumer.requestRandomness({
        keyHash,
        subId, 
        requestConfirmations: 3,
        callbackGasLimit,
        numWords,
        extraArgs: "0x"
      });
      
      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error("Transaction failed");
      }
      const requestId = tx.value;
      console.log(`Random words requested successfully!`);
      console.log(`Request ID: ${requestId}`);
      
      // Wait for fulfillment
      console.log(`Waiting for fulfillment...`);
      const waitInterval = 5000; // 5 seconds
      const timeout = 300000; // 5 minutes
      let elapsed = 0;
      
      while (elapsed < timeout) {
        await new Promise(resolve => setTimeout(resolve, waitInterval));
        elapsed += waitInterval;
        
        try {
          const req_id = await consumer.s_requestId();
          const randomWords = await consumer.s_randomWords(0);
          if (req_id === requestId) {
            console.log(`Request fulfilled!`);
            console.log(`Random words: ${randomWords}`);
            return;
          }
        } catch (e) {
          console.log(`Error checking fulfillment status: ${e}`);
        }
        
        console.log(`Still waiting... ${elapsed / 1000}s elapsed`);

      
      console.log(`Timeout waiting for fulfillment. The request may still be fulfilled later.`);
      }
    } catch (error) {
      console.error("Error requesting randomness:", error);
      throw error;
    }
  });

export {}; 