// scripts/request-randomness.ts
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import "@nomicfoundation/hardhat-ethers";

task("request-randomness", "Request randomness from a VRF consumer contract")
  .addParam("coordinator", "Address of the VRF coordinator contract")
  .addParam("linktoken", "Address of the link token contract")
  .addOptionalParam("numwords", "Number of random words to request", "1")
  .addOptionalParam("confirmations", "Number of confirmations for VRF request", "3")
  .addOptionalParam("callbackgas", "Gas limit for callback", "2500000")
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    try {
      const numWords = parseInt(taskArgs.numwords);
      const minConfirmations = parseInt(taskArgs.confirmations);
      const callbackGasLimit = parseInt(taskArgs.callbackgas);
      const coordinatorAddress = taskArgs.coordinator;
      const linkTokenAddress = taskArgs.linktoken;

      console.log(`==== STEP 1: Setup contracts ====`);
      console.log(`Coordinator address: ${coordinatorAddress}`);
      console.log(`LINK token address: ${linkTokenAddress}`);
      
      // Get contract instances
      const coordinator = await hre.ethers.getContractAt("VRFCoordinatorV2_5", coordinatorAddress);
      const linkToken = await hre.ethers.getContractAt("LinkToken", linkTokenAddress);
      
      // This is the simplest way to get the signer that should work with any version
      console.log(`Getting signer information...`);
      // We can just use the ethers defaultProvider and connect it
      const provider = hre.network.provider;
      const accounts = await provider.request({ method: "eth_accounts" }) as string[];
      const signerAddress = accounts[0];  
      console.log(`Using signer: ${signerAddress}`);

      // Check balance
      const linkBalance = await linkToken.balanceOf(signerAddress);
      console.log(`LINK balance: ${hre.ethers.formatUnits(linkBalance, 18)} LINK`);
      
      // Try direct VRF coordinator interaction
      console.log(`\n==== STEP 2: Create VRF subscription ====`);
      console.log(`Creating subscription directly on coordinator...`);
      
      // Store all active subscription IDs before creating a new one
      let existingSubscriptionIds: any[] = [];
      try {
        // @ts-ignore - This method might not be on the interface but exists on the contract
        existingSubscriptionIds = await coordinator.getActiveSubscriptionIds(0, 100);
        console.log(`Found ${existingSubscriptionIds.length} existing subscriptions before creating new one`);
      } catch (e) {
        console.log(`getActiveSubscriptionIds not available or failed: ${e}`);
        // Try to get existing subscriptions by checking common IDs
        for (let i = 1; i <= 20; i++) {
          try {
            await coordinator.getSubscription(i);
            existingSubscriptionIds.push(i);
          } catch (e) {
            // Subscription doesn't exist
          }
        }
        console.log(`Found ${existingSubscriptionIds.length} existing subscriptions by manual check`);
      }
      
      try {
        const createSubTx = await coordinator.createSubscription();
        console.log(`Transaction sent: ${createSubTx.hash}`);
        const receipt = await createSubTx.wait();
        if (!receipt) {
          throw new Error("Transaction failed");
        }
        console.log(`Transaction mined in block: ${receipt.blockNumber}`);
        console.log(`Transaction logs count: ${receipt.logs.length}`);
        
        // Try to extract subscription ID from events
        let subId: bigint | undefined;
        
        // Check for new subscription IDs after creation
        console.log(`\n🔍 CHECKING FOR NEWLY CREATED SUBSCRIPTION:`);
        let newSubscriptionIds: any[] = [];
        try {
          // @ts-ignore - This method might not be on the interface but exists on the contract
          newSubscriptionIds = await coordinator.getActiveSubscriptionIds(0, 100);
          
          // Find subscription IDs that didn't exist before
          const newIds = newSubscriptionIds.filter(id => !existingSubscriptionIds.includes(id));
          console.log(`Found ${newIds.length} new subscription IDs: ${newIds.join(', ')}`);
          
          if (newIds.length > 0) {
            // Prioritize checking new IDs first
            for (const id of newIds) {
              try {
                const sub = await coordinator.getSubscription(id);
                if (sub.subOwner && sub.subOwner.toLowerCase() === signerAddress.toLowerCase()) {
                  console.log(`✅ FOUND OUR NEW SUBSCRIPTION: ${id}`);
                  subId = BigInt(id);
                  break;
                }
              } catch (e) {
                console.log(`Error checking subscription ${id}: ${e}`);
              }
            }
          }
        } catch (e) {
          console.log(`getActiveSubscriptionIds not available after creation: ${e}`);
        }
        
        // If we still don't have a subId, try the fallback methods
        if (!subId) {
          // IMPORTANT: In VRF 2.5, the primary way to get the subscription ID is directly from the return value
          // of createSubscription, but this only works in synchronous execution, not when waiting for a transaction
          // Let's try to manually parse the return data from the transaction
          
          // For troubleshooting, let's check the return data
          if (receipt.logs.length === 1 && receipt.logs[0].topics.length === 2) {
            // This is the most common pattern for VRF 2.5
            console.log(`\n🔍 DIRECT SUBSCRIPTION ID EXTRACTION:`)
            console.log(`Attempting to find our newly created subscription...`);
            
            // First try: Use getActiveSubscriptionIds if it exists on the coordinator
            try {
              console.log(`Trying to get all active subscription IDs...`);
              // @ts-ignore - This method might not be on the interface but exists on the contract
              const activeIds = await coordinator.getActiveSubscriptionIds(0, 100);
              console.log(`Found ${activeIds.length} active subscriptions: ${activeIds.join(', ')}`);
              
              // Check each active subscription to see if it belongs to us
              for (const id of activeIds) {
                try {
                  const sub = await coordinator.getSubscription(id);
                  console.log(`Checking subscription ${id}:`);
                  console.log(`- Owner: ${sub.subOwner}`);
                  
                  if (sub.subOwner && sub.subOwner.toLowerCase() === signerAddress.toLowerCase()) {
                    console.log(`✅ FOUND OUR SUBSCRIPTION: ${id}`);
                    subId = BigInt(id);
                    
                    // Print full subscription details
                    console.log(`\n📋 SUBSCRIPTION DETAILS:`)
                    console.log(`- ID: ${id}`);
                    console.log(`- Owner: ${sub.subOwner}`);
                    console.log(`- Balance: ${sub.balance?.toString() || '0'}`);
                    console.log(`- Native Balance: ${sub.nativeBalance?.toString() || '0'}`);
                    console.log(`- Request Count: ${sub.reqCount?.toString() || '0'}`);
                    console.log(`- Consumer Count: ${sub.consumers?.length || 0}`);
                    break;
                  }
                } catch (e) {
                  console.log(`Error checking subscription ${id}: ${e}`);
                }
              }
            } catch (e) {
              console.log(`getActiveSubscriptionIds not available or failed: ${e}`);
            }
            
            // If we still don't have a subId, try checking a wide range of subscription IDs
            if (!subId) {
              console.log(`\nTrying to check a wide range of subscription IDs (1-100)...`);
              // The subscription ID could be any value - let's try a wider range
              for (let testId = 1; testId <= 100; testId++) {
                try {
                  const sub = await coordinator.getSubscription(testId);
                  
                  if (sub && sub.subOwner && sub.subOwner.toLowerCase() === signerAddress.toLowerCase()) {
                    console.log(`✅ FOUND OUR SUBSCRIPTION: ${testId}`);
                    // Verify this is a new subscription by checking requestCount
                    if (sub.reqCount !== undefined && sub.reqCount === 0n) {
                      console.log(`This appears to be a newly created subscription with 0 request count.`);
                      subId = BigInt(testId);
                      
                      // Print full subscription details
                      console.log(`\n📋 SUBSCRIPTION DETAILS:`)
                      console.log(`- ID: ${testId}`);
                      console.log(`- Owner: ${sub.subOwner}`);
                      console.log(`- Balance: ${sub.balance?.toString() || '0'}`);
                      console.log(`- Native Balance: ${sub.nativeBalance?.toString() || '0'}`);
                      console.log(`- Request Count: ${sub.reqCount?.toString() || '0'}`);
                      console.log(`- Consumer Count: ${sub.consumers?.length || 0}`);
                      
                      break;
                    } else {
                      console.log(`Subscription ${testId} has request count: ${sub.reqCount?.toString()}, might be an old one.`);
                    }
                  }
                } catch (e) {
                  // Subscription doesn't exist, continue silently
                  if (testId % 10 === 0) {
                    console.log(`Checked subscriptions 1-${testId}, none found yet...`);
                  }
                }
              }
            }
            
            if (subId) {
              console.log(`\n✅ Successfully found subscription ID: ${subId}`);
            } else {
              console.log(`\n❌ Failed to find subscription ID through direct checking.`);
            }
          }
          
          // If we still don't have a subId, try the standard approach with logs
          if (!subId) {
            // Dump logs for debugging
            console.log("\nTransaction logs:");
            for (let i = 0; i < receipt.logs.length; i++) {
              const log = receipt.logs[i];
              console.log(`Log ${i}:`);
              console.log(`  Address: ${log.address}`);
              console.log(`  Topics: ${log.topics.length}`);
              for (let j = 0; j < log.topics.length; j++) {
                console.log(`    Topic ${j}: ${log.topics[j]}`);
              }
              console.log(`  Data: ${log.data}`);
              
              // If this is the coordinator address, try to directly parse the subID from the receipt data
              // immediately after finding the log
              if (log.address.toLowerCase() === coordinatorAddress.toLowerCase()) {
                console.log("This log is from the coordinator, attempting direct hex extraction");
                
                // Direct hex extraction (works for many VRF implementations)
                // The VRF 2.5 subscription ID is often in the first 32 bytes after the owner address
                try {
                  // Skip first 32 bytes (owner address) and read the next 32 bytes
                  if (log.data.length >= 66) { // 0x + 64 hex chars
                    // Different VRF implementations store the subscription ID differently
                    // Try different byte positions (common patterns)
                    
                    // Try as the first 32 bytes
                    const directIdHex = "0x" + log.data.slice(2, 66);
                    console.log(`Direct hex data (first word): ${directIdHex}`);
                    
                    // Try to decode as uint256
                    const possibleId = BigInt(directIdHex);
                    if (possibleId > 0 && possibleId < 1000000) { // Sanity check - IDs are usually small
                      console.log(`🔍 Detected potential subscription ID: ${possibleId} from direct hex extraction`);
                      // Try to verify this ID
                      try {
                        const sub = await coordinator.getSubscription(possibleId);
                        if (sub) {
                          console.log(`Verified subscription ID exists: ${possibleId}`);
                          console.log(`- Owner: ${sub.subOwner}`);
                          if (sub.subOwner.toLowerCase() === signerAddress.toLowerCase()) {
                            console.log(`✅ This is our subscription!`);
                            // Use this ID
                            subId = possibleId;
                          }
                        }
                      } catch (e) {
                        // Ignore verification errors
                      }
                    }
                  }
                } catch (e) {
                  console.log(`Error in direct hex extraction: ${e}`);
                }
              }
            }
            
            // Method 1: Check logs with known topic
            if (receipt.logs.length > 0) {
              console.log("Looking for subscription created event in logs...");
               
              // Common topic IDs for subscription created events across different versions
              const knownSubscriptionCreatedTopics = [
                '0x464722b4166576d3dcbba877b999bc35cf911f4eaf1b6cb7c3512044693085d3', // v2
                '0x1d3015d7ba850fa198dc7b1a3f5d42779313a681035f77c8c03764c61005518d', // v2plus/v2.5
              ];
              
              for (const log of receipt.logs) {
                const topicHex = log.topics[0].toLowerCase();
                console.log(`Checking log topic: ${topicHex}`);
                
                if (knownSubscriptionCreatedTopics.includes(topicHex)) {
                  console.log(`Found subscription creation event with topic: ${topicHex}`);
                  
                  if (topicHex === knownSubscriptionCreatedTopics[0].toLowerCase()) {
                    // For v2 format, subscription ID is in topic[1]
                    subId = BigInt(log.topics[1]);
                    console.log(`VRF v2 format - Found subscription ID in topic[1]: ${subId}`);
                  } else if (topicHex === knownSubscriptionCreatedTopics[1].toLowerCase()) {
                    // For v2.5, subscription hash is in topic[1], need to decode the data
                    const subIdHash = log.topics[1];
                    console.log(`VRF v2.5 format - Found subscription hash in topic[1]: ${subIdHash}`);
                    
                    // SPECIAL EXTRACTION: 
                    // In Chainlink VRF v2.5, the subscription ID is often sequential (1, 2, 3...)
                    // The VRF event emits a hash that's keccak256(abi.encode(subId, msg.sender))
                    // Let's try to brute-force discover the ID by checking each possible ID
                    console.log("Attempting to calculate subscription ID by reverse engineering the hash...");
                    
                    // Try common subscription IDs (1-20, since they're typically sequential)
                    for (let testId = 1; testId <= 20; testId++) {
                      try {
                        // Verify if this ID exists and belongs to us
                        const sub = await coordinator.getSubscription(testId);
                        if (sub) {
                          console.log(`Found existing subscription ${testId}:`);
                          console.log(`- Owner: ${sub.subOwner}`);
                          
                          // If we're the owner, this is likely our subscription
                          if (sub.subOwner && sub.subOwner.toLowerCase() === signerAddress.toLowerCase()) {
                            console.log(`✅ Found our subscription: ${testId}`);
                            subId = BigInt(testId);
                            
                            // Get more details about the subscription for debugging
                            console.log(`=== Subscription ${testId} Details ===`);
                            console.log(`- Owner: ${sub.subOwner}`);
                            if (sub.balance !== undefined) {
                              console.log(`- Balance: ${sub.balance.toString()}`);
                            }
                            // If there are consumers field
                            if (sub.consumers) {
                              console.log(`- Consumers count: ${sub.consumers.length}`);
                              for (let i = 0; i < sub.consumers.length; i++) {
                                console.log(`  - Consumer ${i+1}: ${sub.consumers[i]}`);
                              }
                            }

                            break;
                          }
                        }
                      } catch (e) {
                        // Skip non-existent subscriptions or errors
                      }
                    }
                    
                    // If we found our ID, break out of the log processing loop
                    if (subId) {
                      console.log(`✅ Using subscription ID: ${subId}`);
                      break;
                    }
                    
                    // If we still don't have it, try to directly decode the log
                    try {
                      const abiCoder = hre.ethers.AbiCoder.defaultAbiCoder();
                      // For v2.5 the subscription ID is often encoded in data field
                      const decodedData = abiCoder.decode(['address'], log.data);
                      console.log("Subscription owner from data:", decodedData[0]);
                      
                      // Method 1: Try to extract subscription ID directly from the hash
                      // In some VRF implementations, the hash in topic[1] is keccak256(abi.encode(subId, owner))
                      // which means the topic encodes the subscription ID
                      // Try a direct approach - for VRF 2.5 subscriptions often start at 1 and increment
                      console.log("Trying to derive subscription ID from hash...");
                      
                      // If we can't find it from the hash directly, try querying recent subscriptions
                      console.log("Querying coordinator for recent subscriptions...");
                      let foundSubId = false;
                      
                      // Try subscriptions 1-10 first (most common in fresh deployments)
                      for (let i = 1; i <= 10; i++) {
                        try {
                          const sub = await coordinator.getSubscription(i);
                          console.log(`Found subscription ${i}:`);
                          console.log(`- Owner: ${sub.subOwner}`);
                          
                          // If this is our subscription (based on owner), use it
                          if (sub.subOwner && sub.subOwner.toLowerCase() === signerAddress.toLowerCase()) {
                            console.log(`✅ Subscription ${i} belongs to us!`);
                            subId = BigInt(i);
                            foundSubId = true;
                            break;
                          }
                        } catch (error: any) {
                          // Skip if subscription doesn't exist
                        }
                      }
                      
                      if (!foundSubId) {
                        // If we didn't find it in 1-10, try a wider range
                        // Many VRF implementations assign sequential IDs
                        console.log("Checking for recently created subscriptions (11-30)...");
                        for (let i = 11; i <= 30; i++) {
                          try {
                            const sub = await coordinator.getSubscription(i);
                            console.log(`Found subscription ${i}:`);
                            console.log(`- Owner: ${sub.subOwner}`);
                            
                            if (sub.subOwner && sub.subOwner.toLowerCase() === signerAddress.toLowerCase()) {
                              console.log(`✅ Subscription ${i} belongs to us!`);
                              subId = BigInt(i);
                              foundSubId = true;
                              break;
                            }
                          } catch (error: any) {
                            // Skip if subscription doesn't exist
                          }
                        }
                      }
                      
                      // Second fallback: Try to find the latest subscription ID
                      if (!foundSubId) {
                        console.log("Using binary search to find the latest subscription ID...");
                        
                        // Use a binary search to find the upper bound of subscription IDs
                        // Start with a large range
                        let left = 1;
                        let right = 1000; // Arbitrary upper limit
                        let maxExistingId = 0;
                        
                        while (left <= right) {
                          const mid = Math.floor((left + right) / 2);
                          try {
                            await coordinator.getSubscription(mid);
                            // If we get here, the subscription exists
                            maxExistingId = Math.max(maxExistingId, mid);
                            left = mid + 1; // Look for higher IDs
                          } catch (error: any) {
                            // Subscription doesn't exist
                            right = mid - 1; // Look for lower IDs
                          }
                        }
                        
                        if (maxExistingId > 0) {
                          console.log(`Found maximum existing subscription ID: ${maxExistingId}`);
                          // Check the most recent subscriptions first (they're more likely to be ours)
                          for (let i = maxExistingId; i >= Math.max(1, maxExistingId - 5); i--) {
                            try {
                              const sub = await coordinator.getSubscription(i);
                              console.log(`Checking subscription ${i}:`);
                              console.log(`- Owner: ${sub.subOwner}`);
                              
                              if (sub.subOwner && sub.subOwner.toLowerCase() === signerAddress.toLowerCase()) {
                                console.log(`✅ Found our subscription: ${i}`);
                                subId = BigInt(i);
                                foundSubId = true;
                                break;
                              }
                            } catch (error: any) {
                              // Skip if there's an error
                            }
                          }
                        }
                      }
                      
                      if (!foundSubId) {
                        console.log("Could not find our subscription ID through coordinator queries.");
                      }
                      
                    } catch (error: any) {
                      console.log(`Error while trying to find subscription ID: ${error.message}`);
                    }
                  }
                  
                  if (subId) break;
                }
              }
            }
          }
        }
        
        // If we couldn't find it, try to create a new one with specific subId
        if (!subId) {
          console.log("Could not find subscription ID from logs, trying direct approach...");
          
          // Get metadata via low-level call to avoid type errors
          let isV2_5 = false;
          try {
            // Use a low-level call to avoid type issues - we need to manually specify the function signature
            // since it's not in the interface
            const functionSelector = "0x181f5a77"; // typeAndVersion() function selector
            const result = await provider.send("eth_call", [
              { to: coordinatorAddress, data: functionSelector },
              "latest"
            ]);
            
            if (result && result !== "0x") {
              // typeAndVersion returns a string, decode it
              try {
                const decoded = hre.ethers.AbiCoder.defaultAbiCoder().decode(["string"], result);
                const version = decoded[0];
                console.log(`Coordinator version: ${version}`);
                isV2_5 = version.includes('2.5') || version.includes('v2.5') || version.includes('V2_5');
              } catch (e) {
                console.log("Error decoding version string");
              }
            }
          } catch (error: any) {
            console.log("Could not determine coordinator version");
          }
          
          // Try with subscription ID 1 (commonly used in local/test environments)
          let firstSubExists = false;
          try {
            // Check if subscription 1 exists and if we can use it
            const sub = await coordinator.getSubscription(1);
            if (sub) {
              console.log(`Subscription 1 exists:`);
              console.log(`- Owner: ${sub.subOwner || 'Unknown'}`);
              
              // If we're the owner, reuse this subscription
              if (sub.subOwner && sub.subOwner.toLowerCase() === signerAddress.toLowerCase()) {
                console.log(`We own subscription 1, will use it`);
                subId = BigInt(1);
                firstSubExists = true;
              } else {
                console.log(`Subscription 1 belongs to someone else, need to create a new one`);
                firstSubExists = true;
              }
            }
          } catch (error: any) {
            console.log(`Subscription 1 does not exist or cannot be accessed`);
          }
          
          // If we still don't have a subscription, check a few more
          if (!subId) {
            for (let i = 2; i <= 5; i++) {
              try {
                const sub = await coordinator.getSubscription(i);
                if (sub && sub.subOwner && sub.subOwner.toLowerCase() === signerAddress.toLowerCase()) {
                  console.log(`Found subscription ${i} that belongs to us, using it`);
                  subId = BigInt(i);
                  break;
                }
              } catch (e) {
                // Subscription doesn't exist, continue
              }
            }
          }
          
          // As a last resort, use ID 1 with a warning
          if (!subId) {
            if (!firstSubExists) {
              console.log(`⚠️ WARNING: Using subscription ID 1 as fallback, since no subscription was found`);
              subId = BigInt(1);
            } else {
              throw new Error("Could not find a usable subscription and subscription 1 belongs to someone else");
            }
          }
        }
        
        // Deploy a consumer
        console.log(`\n==== STEP 3: Deploy VRF consumer ====`);
        const consumer = await (await hre.ethers.getContractFactory("VRFConsumerV2Plus")).deploy(coordinatorAddress, linkTokenAddress);
        await consumer.waitForDeployment();
        const consumerAddress = await consumer.getAddress();
        console.log(`Consumer deployed at: ${consumerAddress}`);
        
        // Add consumer to subscription
        console.log(`\n==== STEP 4: Add consumer to subscription ====`);
        console.log(`Adding consumer to subscription ${subId}...`);
        
        // We'll add explicit error handling for the known subscription error
        try {
          const addTx = await coordinator.addConsumer(subId, consumerAddress);
          console.log(`Transaction sent: ${addTx.hash}`);
          await addTx.wait();
          console.log(`Consumer added successfully`);
        } catch (error: any) {
          console.error(`Error adding consumer: ${error.message}`);
          
          // Decode the error if possible
          if (error.data) {
            console.error(`Error data: ${error.data}`);
            
            // Check for the specific non-existent subscription error
            if (error.data === '0x1f6a65b6') {
              console.error(`ERROR: Non-existent subscription - The subscription ID ${subId} doesn't exist`);
              console.error(`You may need to create the subscription manually or determine the correct ID`);
              throw new Error(`Subscription ${subId} does not exist`);
            }
            
            // Try to decode the error selector
            try {
              const errorSelector = error.data.slice(0, 10);
              console.error(`Error selector: ${errorSelector}`);
              
              // Known error selectors
              const knownErrors: Record<string, string> = {
                '0x1f6a65b6': 'NonExistentSubscription',
                '0x7aa5175d': 'InsufficientBalance',
                '0x756688fe': 'InvalidConsumer',
                '0x756e89cb': 'InvalidSubscription'
              };
              
              if (knownErrors[errorSelector]) {
                console.error(`Identified error: ${knownErrors[errorSelector]}`);
              }
            } catch (e) {
              // Ignore error decoding failure
            }
          }
          
          // Special case: if sub doesn't exist, try to create it directly
          if (error.data === '0x1f6a65b6') {
            console.log(`\nAttempting to create subscription ${subId} directly...`);
            try {
              // Try with an explicit ID if possible
              const createSubWithIdTx = await coordinator.createSubscription();
              console.log(`Transaction sent: ${createSubWithIdTx.hash}`);
              const receipt = await createSubWithIdTx.wait();
              console.log(`Transaction mined in block: ${receipt?.blockNumber}`);
              
              // Now try adding the consumer again
              console.log(`Retrying consumer addition...`);
              const retryAddTx = await coordinator.addConsumer(subId, consumerAddress);
              await retryAddTx.wait();
              console.log(`Consumer added successfully on retry`);
            } catch (retryError: any) {
              console.error(`Failed to create subscription and add consumer: ${retryError.message}`);
              throw retryError;
            }
          } else {
            // Otherwise rethrow the error
            throw error;
          }
        }
        
        // Fund subscription
        console.log(`\n==== STEP 5: Fund subscription ====`);
        console.log(`Funding subscription ${subId} with 2 LINK...`);
        
        // First approve LINK transfer
        console.log(`Approving LINK transfer to coordinator...`);
        const approveTx = await linkToken.approve(coordinatorAddress, hre.ethers.parseUnits("2", 18));
        await approveTx.wait();
        console.log(`Approval successful`);
        
        // Then transfer LINK to the subscription
        console.log(`Transferring LINK to subscription...`);
        
        // Encode the subId for the transferAndCall
        // Note: Format may depend on coordinator implementation, might need uint64/uint256
        let encodedSubId;
        try {
          encodedSubId = hre.ethers.AbiCoder.defaultAbiCoder().encode(['uint64'], [subId]);
          console.log(`Encoded subscription ID (uint64): ${encodedSubId}`);
        } catch (e) {
          // Try uint256 format if uint64 fails
          encodedSubId = hre.ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [subId]);
          console.log(`Encoded subscription ID (uint256): ${encodedSubId}`);
        }
        
        // Transfer and call
        const fundTx = await linkToken.transferAndCall(
          coordinatorAddress, 
          hre.ethers.parseUnits("2", 18),
          encodedSubId
        );
        console.log(`Transaction sent: ${fundTx.hash}`);
        await fundTx.wait();
        console.log(`Subscription funded successfully!`);
        
        // Request randomness
        console.log(`\n==== STEP 6: Request randomness ====`);
        console.log(`Getting key hash...`);
        // Some coordinators store key hashes in s_provingKeyHashes array
        let keyHash;
        try {
          keyHash = await coordinator.s_provingKeyHashes(0);
          console.log(`Got key hash: ${keyHash}`);
        } catch (error: any) {
          console.log(`Couldn't get key hash from s_provingKeyHashes, using fallback...`);
          // Fallback to a well-known key hash or get it another way
          keyHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
          console.log(`Using fallback key hash: ${keyHash}`);
        }
        
        console.log(`Requesting ${numWords} random words...`);
        console.log(`Callback gas limit: ${callbackGasLimit}`);
        
        const requestTx = await consumer.requestRandomness({
          keyHash,
          subId,
          requestConfirmations: minConfirmations,
          callbackGasLimit,
          numWords,
          extraArgs: "0x"
        });
        
        console.log(`Request sent: ${requestTx.hash}`);
        await requestTx.wait();
        console.log(`Request transaction mined!`);
        
        const requestId = await consumer.s_requestId();
        console.log(`Request ID: ${requestId}`);
        
        const dummyWords = Array(numWords).fill(hre.ethers.randomBytes(32));
        try {
          const needed = await consumer.rawFulfillRandomWords.estimateGas(requestId, dummyWords);
          console.log(`Estimated gas needed for fulfillment: ${needed}`);
        } catch (error: any) {
          console.log(`Could not estimate callback gas: ${error.message}`);
        }

        // Check for the RandomWordsRequested event in the request transaction receipt
        console.log(`\n==== CHECKING EVENTS FROM REQUEST TX ====`);
        try {
          const requestReceipt = await provider.send("eth_getTransactionReceipt", [requestTx.hash]);
          if (requestReceipt && requestReceipt.logs) {
            console.log(`Found ${requestReceipt.logs.length} logs in the request transaction`);
            
            // Check if any logs are from the coordinator
            for (const log of requestReceipt.logs) {
              if (log.address.toLowerCase() === coordinatorAddress.toLowerCase()) {
                console.log(`Found log from coordinator at index ${requestReceipt.logs.indexOf(log)}`);
                
                // Check for RandomWordsRequested event (topic[0])
                if (log.topics[0] === '0x63373d1c4696214b898952999c9aaec57dac1ee2723cec59bea6888f489a9772') {
                  console.log(`✅ Found RandomWordsRequested event!`);
                  
                  // The request ID is usually in topic[1]
                  const eventRequestId = log.topics[1];
                  console.log(`Request ID from event: ${eventRequestId}`);
                }
                
                // Check for RandomWordsFulfilled event (indicating in-tx fulfillment)
                if (log.topics[0] === '0x7dffc5ae5ee4e2e4df1651cf6ad329a73cebdb728f38e8f424e4c59c26a345e5') {
                  console.log(`✅ Found RandomWordsFulfilled event in the same transaction!`);
                  console.log(`This means the request was fulfilled immediately`);
                  
                  // The request ID is usually in topic[1]
                  const fulfilledRequestId = log.topics[1];
                  console.log(`Fulfilled Request ID: ${fulfilledRequestId}`);
                  
                  // Try to decode the randomness from the data field if it exists
                  if (log.data && log.data !== '0x') {
                    try {
                      const abiCoder = hre.ethers.AbiCoder.defaultAbiCoder();
                      const decodedData = abiCoder.decode(['uint256', 'uint256[]'], log.data);
                      console.log(`Success payment: ${decodedData[0]}`);
                      console.log(`Random words: ${decodedData[1]}`);
                    } catch (e) {
                      console.log(`Could not decode fulfillment data: ${e}`);
                    }
                  }
                }
              }
              
              // Check if any logs are from the consumer contract
              if (log.address.toLowerCase() === consumerAddress.toLowerCase()) {
                console.log(`Found log from consumer contract at index ${requestReceipt.logs.indexOf(log)}`);
              }
            }
          }
          
          // Now let's check the blockchain for any recent fulfillment events
          console.log(`\nChecking for recent fulfillment events...`);
          
          // Get current block number
          const currentBlock = await provider.send("eth_blockNumber", []);
          const currentBlockNumber = parseInt(currentBlock, 16);
          console.log(`Current block: ${currentBlockNumber}`);
          
          // Look for fulfillment events in recent blocks
          const fromBlock = Math.max(currentBlockNumber - 10, 0); // Last 10 blocks
          
          const fulfillmentLogs = await provider.send("eth_getLogs", [{
            fromBlock: `0x${fromBlock.toString(16)}`,
            toBlock: "latest",
            address: coordinatorAddress,
            topics: [
              '0x7dffc5ae5ee4e2e4df1651cf6ad329a73cebdb728f38e8f424e4c59c26a345e5', // RandomWordsFulfilled event signature
            ]
          }]);
          
          if (fulfillmentLogs && fulfillmentLogs.length > 0) {
            console.log(`Found ${fulfillmentLogs.length} fulfillment events in recent blocks`);
            
            // Check if any of them match our request ID
            for (const log of fulfillmentLogs) {
              // Convert our requestId to the format in the logs
              const requestIdHex = `0x${requestId.toString(16).padStart(64, '0')}`;
              
              if (log.topics[1] === requestIdHex) {
                console.log(`✅ Found fulfillment event for our request ID!`);
                console.log(`Block number: ${parseInt(log.blockNumber, 16)}`);
                console.log(`Transaction hash: ${log.transactionHash}`);
                
                // Try to decode the random words from the data
                if (log.data && log.data !== '0x') {
                  try {
                    const abiCoder = hre.ethers.AbiCoder.defaultAbiCoder();
                    const decodedData = abiCoder.decode(['uint256', 'uint256[]'], log.data);
                    console.log(`Success payment: ${decodedData[0]}`);
                    console.log(`Random words: ${decodedData[1]}`);
                  } catch (e) {
                    console.log(`Could not decode fulfillment data: ${e}`);
                  }
                }
              }
            }
          } else {
            console.log(`No recent fulfillment events found`);
          }
          
          // Directly check storage slots of the consumer contract
          console.log(`\n==== DIRECTLY CHECKING CONTRACT STORAGE ====`);
          
          // Check the s_randomWords array length (storage slot 0)
          const randomWordsSlot = "0x0000000000000000000000000000000000000000000000000000000000000000"; // slot 0
          const randomWordsLengthHex = await provider.send("eth_getStorageAt", [
            consumerAddress,
            randomWordsSlot,
            "latest"
          ]);
          
          console.log(`s_randomWords array length (hex): ${randomWordsLengthHex}`);
          if (randomWordsLengthHex && randomWordsLengthHex !== "0x") {
            const arrayLength = parseInt(randomWordsLengthHex, 16);
            console.log(`s_randomWords array length: ${arrayLength}`);
            
            if (arrayLength > 0) {
              // For dynamic arrays, slot keccak256(slot) contains the first element
              const arrayDataSlot = hre.ethers.keccak256(randomWordsSlot);
              console.log(`Array data slot: ${arrayDataSlot}`);
              
              const randomWordHex = await provider.send("eth_getStorageAt", [
                consumerAddress,
                arrayDataSlot,
                "latest"
              ]);
              
              console.log(`s_randomWords[0] value (hex): ${randomWordHex}`);
              if (randomWordHex && randomWordHex !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
                const randomWord = BigInt(randomWordHex);
                console.log(`✅ Random word found: ${randomWord}`);
                console.log(`The VRF request has been successfully fulfilled!`);
              } else {
                console.log(`No random word found in storage.`);
              }
            }
          }
          
          // Check s_requestId (storage slot 1)
          const requestIdSlot = "0x0000000000000000000000000000000000000000000000000000000000000001"; // slot 1
          const storedRequestIdHex = await provider.send("eth_getStorageAt", [
            consumerAddress,
            requestIdSlot,
            "latest"
          ]);
          
          console.log(`s_requestId in contract: ${BigInt(storedRequestIdHex)}`);
          console.log(`Current requestId from our call: ${requestId}`);
          
          // Check s_gasAvailable (storage slot 3)
          const gasAvailableSlot = "0x0000000000000000000000000000000000000000000000000000000000000003"; // slot 3
          const gasAvailableHex = await provider.send("eth_getStorageAt", [
            consumerAddress,
            gasAvailableSlot,
            "latest"
          ]);
          
          console.log(`s_gasAvailable (hex): ${gasAvailableHex}`);
          const gasAvailable = parseInt(gasAvailableHex, 16);
          console.log(`s_gasAvailable: ${gasAvailable}`);
          
          if (gasAvailable > 0) {
            console.log(`✅ The s_gasAvailable value indicates that fulfillment has occurred!`);
            console.log(`The VRF request is confirmed to be fulfilled.`);
          } else {
            console.log(`The s_gasAvailable is 0, indicating the randomness hasn't been fulfilled yet.`);
          }
          
        } catch (error: any) {
          console.log(`Error checking request events: ${error.message}`);
        }
        
        console.log(`\n==== STEP 7: Wait for fulfillment ====`);
        console.log(`Waiting for fulfillment...`);
        
        const waitInterval = 5000; // 5 seconds
        const timeout = 300000; // 5 minutes
        let elapsed = 0;
        
        while (elapsed < timeout) {
          await new Promise(resolve => setTimeout(resolve, waitInterval));
          elapsed += waitInterval;
          
          try {
            // First try to get the requestId from the consumer
            // Use direct storage access instead of contract call
            const requestIdSlot = "0x0000000000000000000000000000000000000000000000000000000000000001"; // slot 1
            const storedRequestIdHex = await provider.send("eth_getStorageAt", [
              consumerAddress,
              requestIdSlot,
              "latest"
            ]);
            const currentRequestId = BigInt(storedRequestIdHex);
            console.log(`Current request ID: ${currentRequestId}`);
            
            console.log(`Checking for fulfillment using direct storage access...`);
            
            // Check s_randomWords array length (slot 0)
            const randomWordsSlot = "0x0000000000000000000000000000000000000000000000000000000000000000"; // slot 0
            const randomWordsLengthHex = await provider.send("eth_getStorageAt", [
              consumerAddress,
              randomWordsSlot,
              "latest"
            ]);
            
            console.log(`s_randomWords array length (hex): ${randomWordsLengthHex}`);
            const arrayLength = parseInt(randomWordsLengthHex, 16);
            console.log(`s_randomWords array length: ${arrayLength}`);
            
            if (arrayLength > 0) {
              // For dynamic arrays, slot keccak256(slot) contains the first element
              const arrayDataSlot = hre.ethers.keccak256(randomWordsSlot);
              console.log(`Array data slot: ${arrayDataSlot}`);
              
              const randomWordHex = await provider.send("eth_getStorageAt", [
                consumerAddress,
                arrayDataSlot,
                "latest"
              ]);
              
              console.log(`s_randomWords[0] value (hex): ${randomWordHex}`);
              if (randomWordHex && randomWordHex !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
                const randomWord = BigInt(randomWordHex);
                console.log(`✅ Random word found: ${randomWord}`);
                console.log(`The VRF request has been successfully fulfilled!`);
                return;
              } else {
                console.log(`Array slot exists but no value found yet.`);
              }
            }
            
            // Check s_gasAvailable (slot 3) which is set during fulfillment
            const gasAvailableSlot = "0x0000000000000000000000000000000000000000000000000000000000000003"; // slot 3
            const gasAvailableHex = await provider.send("eth_getStorageAt", [
              consumerAddress,
              gasAvailableSlot,
              "latest"
            ]);
            
            console.log(`s_gasAvailable (hex): ${gasAvailableHex}`);
            const gasAvailable = parseInt(gasAvailableHex, 16);
            console.log(`s_gasAvailable: ${gasAvailable}`);
            
            if (gasAvailable > 0) {
              console.log(`✅ The s_gasAvailable value is ${gasAvailable}, which indicates fulfillment occurred`);
              console.log(`Fulfillment happened but randomness might not be stored correctly.`);
              
              // Check recent events for this request ID
              console.log(`Checking for fulfillment events...`);
              
              // Get current block
              const currentBlock = await provider.send("eth_blockNumber", []);
              const currentBlockNumber = parseInt(currentBlock, 16);
              
              // Look for fulfillment events in recent blocks
              const fromBlock = Math.max(currentBlockNumber - 20, 0); // Last 20 blocks
              
              const fulfillmentLogs = await provider.send("eth_getLogs", [{
                fromBlock: `0x${fromBlock.toString(16)}`,
                toBlock: "latest",
                address: coordinatorAddress,
                topics: [
                  '0x7dffc5ae5ee4e2e4df1651cf6ad329a73cebdb728f38e8f424e4c59c26a345e5', // RandomWordsFulfilled event signature
                ]
              }]);
              
              if (fulfillmentLogs && fulfillmentLogs.length > 0) {
                console.log(`Found ${fulfillmentLogs.length} fulfillment events in recent blocks`);
                
                // Create requestId hex with proper padding
                const requestIdHex = `0x${requestId.toString(16).padStart(64, '0')}`;
                
                for (const log of fulfillmentLogs) {
                  if (log.topics.length > 1 && log.topics[1] === requestIdHex) {
                    console.log(`✅ Found fulfillment event for our request!`);
                    
                    // Try to decode data
                    try {
                      const abiCoder = hre.ethers.AbiCoder.defaultAbiCoder();
                      const decodedData = abiCoder.decode(['uint256', 'uint256[]'], log.data);
                      console.log(`Success payment: ${decodedData[0]}`);
                      console.log(`Random words from event: ${decodedData[1]}`);
                    } catch (e) {
                      console.log(`Could not decode event data: ${e}`);
                    }
                    
                    return;
                  }
                }
                
                console.log(`No events matching our request ID`);
              } else {
                console.log(`No fulfillment events found in recent blocks`);
              }
              
              // If s_gasAvailable is set but we couldn't find the random word, we'll consider it fulfilled
              console.log(`Fulfillment likely occurred based on s_gasAvailable > 0`);
              return;
            }
            
          } catch (error: any) {
            console.log(`Error checking fulfillment: ${error.message}`);
          }
          
          console.log(`Still waiting... ${elapsed / 1000}s elapsed`);
        }
        
        console.log(`Timeout waiting for fulfillment. The request may still be fulfilled later.`);
        
      } catch (error: any) {
        console.error(`Step failed: ${error.message}`);
        if (error.data) {
          console.error(`Error data: ${error.data}`);
        }
        if (error.transaction) {
          console.error(`Transaction: ${JSON.stringify(error.transaction)}`);
        }
        throw error;
      }
      
    } catch (error: any) {
      console.error("Error:", error.message);
      throw error;
    }
  });

export {};