// scripts/request-randomness.ts
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Log } from "ethers";

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
      
      const tx = await consumer.requestRandomWords(
        subId, 
        numWords,
        minConfirmations,
        callbackGasLimit,
        false // Don't use native payment
      );
      
      const receipt = await tx.wait();
      if (!receipt) {
        throw new Error("Transaction failed");
      }
      
      // Find request ID from logs
      const requestIdLog = receipt.logs
        .map((log: Log) => {
          try {
            return consumer.interface.parseLog(log);
          } catch (e) {
            return null;
          }
        })
        .find((log: any) => log?.name === "RandomWordsRequested");
      
      if (requestIdLog) {
        const requestId = requestIdLog.args[5]; // The request ID is the 6th argument in the event
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
            const fulfilled = await consumer.getRequestStatus(requestId);
            if (fulfilled.fulfilled) {
              console.log(`Request fulfilled!`);
              console.log(`Random words: ${fulfilled.randomWords.map((w: bigint) => w.toString()).join(', ')}`);
              return;
            }
          } catch (e) {
            console.log(`Error checking fulfillment status: ${e}`);
          }
          
          console.log(`Still waiting... ${elapsed / 1000}s elapsed`);
        }
        
        console.log(`Timeout waiting for fulfillment. The request may still be fulfilled later.`);
      } else {
        console.log(`Transaction confirmed but couldn't find request ID in logs.`);
      }
      
    } catch (error) {
      console.error("Error requesting randomness:", error);
      throw error;
    }
  });

export {}; 