const hre = require("hardhat");

async function main() {
  // The request ID to check
  const requestId = "95933000051404628209030226940242927414566815605291631835729339382906296603749";
  
  console.log(`\n==== CHECKING REQUEST COMMITMENT FOR REQUEST ID ====`);
  console.log(`Request ID: ${requestId}`);
  
  // Get the network information first to display it
  const network = await hre.ethers.provider.getNetwork();
  console.log(`Network: ${network.name} (chainId: ${network.chainId})`);
  
  // Get the command line arguments from process.argv
  // The first two elements are 'node' and the script name, so we skip them
  const args = process.argv.slice(2);
  
  // Check if coordinator address was provided as command line argument
  let coordinatorAddress;
  if (args.length > 0) {
    coordinatorAddress = args[0];
  } else {
    // Prompt user for coordinator address if not provided
    console.log(`\nNo coordinator address provided as command-line argument.`);
    console.log(`Please enter the VRF Coordinator address:`);
    
    // Since we need user input, use a workaround
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    // Wrap the readline question in a Promise
    coordinatorAddress = await new Promise(resolve => {
      readline.question('VRF Coordinator address: ', address => {
        readline.close();
        return resolve(address);
      });
    });
  }
  
  if (!coordinatorAddress || !coordinatorAddress.startsWith('0x') || coordinatorAddress.length !== 42) {
    console.error(`\nInvalid coordinator address: ${coordinatorAddress}`);
    console.error(`Please provide a valid Ethereum address starting with 0x`);
    process.exit(1);
  }
  
  console.log(`\nUsing VRF Coordinator: ${coordinatorAddress}`);
  
  try {
    // Get the VRF coordinator contract
    console.log(`Connecting to VRF Coordinator contract...`);
    const coordinator = await hre.ethers.getContractAt("VRFCoordinatorV2_5", coordinatorAddress);
    
    // Check for contract validity
    try {
      // Try to call a simple view function to verify the contract is valid
      console.log(`Verifying contract validity...`);
      const typeAndVersionSelector = "0x181f5a77"; // typeAndVersion() function selector
      const data = await hre.ethers.provider.call({
        to: coordinatorAddress,
        data: typeAndVersionSelector
      });
      
      if (data && data !== '0x') {
        try {
          const abiCoder = hre.ethers.AbiCoder.defaultAbiCoder();
          const decoded = abiCoder.decode(["string"], data);
          console.log(`Contract type and version: ${decoded[0]}`);
        } catch (e) {
          console.log(`Could not decode typeAndVersion response, but contract appears valid`);
        }
      }
    } catch (e) {
      console.log(`Could not verify contract type, continuing anyway...`);
    }
    
    // Get the request commitment
    console.log(`\nFetching request commitment...`);
    const commitment = await coordinator.s_requestCommitments(requestId);
    
    console.log(`\n==== RESULT ====`);
    console.log(`Commitment: ${commitment}`);
    
    if (commitment === "0x0000000000000000000000000000000000000000000000000000000000000000") {
      console.log(`\nThe commitment is zero, which means either:`);
      console.log(`1. The request ID does not exist in the coordinator`);
      console.log(`2. The request has already been fulfilled`);
      console.log(`3. You're checking on the wrong network or coordinator address`);
    } else {
      console.log(`\nThe commitment is non-zero, which means:`);
      console.log(`1. The request exists in the coordinator`);
      console.log(`2. The request has not been fulfilled yet`);
      
      // Try to decode the commitment for more info
      console.log(`\n==== COMMITMENT DETAILS ====`);
      console.log(`The commitment is keccak256(abi.encode(requestId, blockNum, subId, callbackGasLimit, numWords, sender, extraArgs))`);
      console.log(`Unfortunately we cannot recover the original parameters from just the hash.`);
      
      // Try to find pending requests in the subscription
      try {
        console.log(`\n==== TRYING TO FIND PENDING REQUESTS ====`);
        console.log(`Checking recent blocks for RandomWordsRequested events...`);
        
        // Get current block number
        const currentBlock = await hre.ethers.provider.getBlockNumber();
        console.log(`Current block: ${currentBlock}`);
        
        // Look back approximately 1000 blocks or to block 0
        const fromBlock = Math.max(0, currentBlock - 1000);
        console.log(`Searching from block ${fromBlock} to ${currentBlock}`);
        
        // Format request ID to match event topic format
        const requestIdHex = `0x${BigInt(requestId).toString(16).padStart(64, '0')}`;
        
        const filter = {
          address: coordinatorAddress,
          topics: [
            '0x63373d1c4696214b898952999c9aaec57dac1ee2723cec59bea6888f489a9772', // RandomWordsRequested
            requestIdHex
          ],
          fromBlock: fromBlock,
          toBlock: 'latest'
        };
        
        const logs = await hre.ethers.provider.getLogs(filter);
        
        if (logs.length > 0) {
          console.log(`Found ${logs.length} matching RandomWordsRequested events`);
          
          for (const log of logs) {
            console.log(`\nEvent found in block: ${log.blockNumber}`);
            console.log(`Transaction hash: ${log.transactionHash}`);
            
            try {
              // Try to decode the log
              const parsedLog = coordinator.interface.parseLog({
                topics: log.topics,
                data: log.data
              });
              
              if (parsedLog) {
                console.log(`\nDecoded Event Fields:`);
                for (const [key, value] of Object.entries(parsedLog.args)) {
                  if (isNaN(key)) { // Skip numeric indices
                    console.log(`- ${key}: ${value.toString()}`);
                  }
                }
              }
            } catch (e) {
              console.log(`Could not decode log data: ${e.message}`);
            }
          }
        } else {
          console.log(`No RandomWordsRequested events found for this request ID in the last 1000 blocks`);
          console.log(`This may mean the request was made longer ago or on a different network`);
        }
      } catch (e) {
        console.log(`Error querying for events: ${e.message}`);
      }
    }
    
  } catch (error) {
    console.error(`\nERROR: ${error.message}`);
    
    if (error.message.includes("contract not deployed") || 
        error.message.includes("call revert exception")) {
      console.error(`The coordinator contract does not exist at the provided address on this network`);
      console.error(`Please check that you're on the correct network and using the correct address`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`Unhandled error: ${error.message}`);
    process.exit(1);
  }); 