// scripts/vrf2plus/deploy-vrf-system.ts
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import {
  isArbitrumChain, 
  isOPStackChain,  
  VRFDeployment,
  getorSetupLinkTokenAndFeed,
  encodeOnChainVRFProvingKey, 
} from "../utils/contract-utils";
import { getVRFV2PlusDeployConfig } from "../utils/env";

dotenv.config();

async function main() {
  // Get configuration and setup
  const config = getVRFV2PlusDeployConfig();
  console.log("Starting VRF system deployment with config:", config);
  // Get network information
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  
  try {
    // 1. Deploy BlockhashStore
    console.log("Deploying BlockhashStore...");
    const BlockhashStore = await ethers.getContractFactory("@chainlink/contracts/src/v0.8/vrf/dev/BlockhashStore.sol:BlockhashStore");
    const bhs = await BlockhashStore.deploy();
    await bhs.waitForDeployment();
    const bhsAddress = await bhs.getAddress();
    console.log(`BlockhashStore deployed to: ${bhsAddress}`);
    
    // 2. Deploy BatchBlockhashStore
    console.log("Deploying BatchBlockhashStore...");
    const BatchBHS = await ethers.getContractFactory("BatchBlockhashStore");
    const batchBHS = await BatchBHS.deploy(bhsAddress);
    await batchBHS.waitForDeployment();
    const batchBHSAddress = await batchBHS.getAddress();
    console.log(`BatchBlockhashStore deployed to: ${batchBHSAddress}`);
    
    // 3. Deploy chain-specific VRFCoordinator
    let coordinator;
    
    if (config.NETWORK_TYPE === "optimism" || config.NETWORK_TYPE === "base") {
      console.log("Deploying Optimism VRFCoordinatorV2_5...");
      const VRFCoordinatorOptimism = await ethers.getContractFactory("VRFCoordinatorV2_5_Optimism");
      coordinator = await VRFCoordinatorOptimism.deploy(bhsAddress);
      await coordinator.waitForDeployment();
      
      // Set L1 fee calculation for Optimism
      console.log("Setting L1 fee calculation for Optimism...");
      const setL1FeeTx = await coordinator.setL1FeeCalculation(
        config.L1_FEE_CALCULATION_MODE,
        config.L1_FEE_COEFFICIENT
      );
      await setL1FeeTx.wait();
    } 
    else if (config.NETWORK_TYPE === "arbitrum") {
      console.log("Deploying Arbitrum VRFCoordinatorV2_5...");
      const VRFCoordinatorArbitrum = await ethers.getContractFactory("VRFCoordinatorV2_5_Arbitrum");
      coordinator = await VRFCoordinatorArbitrum.deploy(bhsAddress);
      await coordinator.waitForDeployment();
    } 
    else if (config.USE_TEST_COORDINATOR) {
      console.log("Deploying Test VRFCoordinatorV2_5...");
      const VRFCoordinatorTest = await ethers.getContractFactory("VRFCoordinatorTestV2_5");
      coordinator = await VRFCoordinatorTest.deploy(bhsAddress);
      await coordinator.waitForDeployment();
    } 
    else {
      console.log("Deploying Standard VRFCoordinatorV2_5...");
      const VRFCoordinator = await ethers.getContractFactory("VRFCoordinatorV2_5");
      coordinator = await VRFCoordinator.deploy(bhsAddress);
      await coordinator.waitForDeployment();
    }
    
    const coordinatorAddress = await coordinator.getAddress();
    console.log(`VRFCoordinatorV2_5 deployed to: ${coordinatorAddress}`);
    
    // 4. Deploy BatchVRFCoordinator
    console.log("Deploying BatchVRFCoordinatorV2Plus...");
    const BatchCoordinator = await ethers.getContractFactory("BatchVRFCoordinatorV2Plus");
    const batchCoordinator = await BatchCoordinator.deploy(coordinatorAddress);
    await batchCoordinator.waitForDeployment();
    const batchCoordinatorAddress = await batchCoordinator.getAddress();
    console.log(`BatchVRFCoordinatorV2Plus deployed to: ${batchCoordinatorAddress}`);
    
    // 5. Deploy or use existing LINK token
    const { linkTokenAddress, linkEthFeedAddress, linkToken, linkEthFeed } = await getorSetupLinkTokenAndFeed( config.LINK_TOKEN_ADDRESS, config.LINK_NATIVE_TOKEN_FEED_ADDRESS );
    
    // 7. Configure coordinator
    console.log("Setting coordinator configuration...");
    const configTx = await coordinator.setConfig(
      config.MIN_CONFIRMATIONS,
      config.MAX_GAS_LIMIT,
      config.STALENESS_SECONDS,
      config.GAS_AFTER_PAYMENT,
      ethers.parseUnits(config.FALLBACK_WEI_PER_UNIT_LINK, 0),
      config.FULFILLMENT_FLAT_FEE_NATIVE_PPM,
      config.FULFILLMENT_FLAT_FEE_LINK_DISCOUNT_PPM,
      config.NATIVE_PREMIUM_PERCENTAGE,
      config.LINK_PREMIUM_PERCENTAGE
    );
    await configTx.wait();
    console.log("Coordinator configuration set");
    
    // 8. Set LINK token and LINK/ETH feed
    console.log("Setting LINK token and LINK/ETH feed addresses...");
    const linkFeedTx = await coordinator.setLINKAndLINKNativeFeed(
      await linkToken.getAddress(),
      await linkEthFeed.getAddress()
    );
    await linkFeedTx.wait();
    console.log("LINK token and LINK/ETH feed addresses set");

    // 9. Set VRF key from uncompressed key
    console.log("Setting VRF key from uncompressed key...");
    const { coordinates } = encodeOnChainVRFProvingKey(config.UNCOMPRESSED_VRF_KEY);
    const LANE_CAP = ethers.parseUnits("500", "gwei");
    const setVRFKeyTx = await coordinator.registerProvingKey(coordinates, LANE_CAP);
    await setVRFKeyTx.wait();
    
    // 9. Deploy consumer
    console.log(`Deploying VRF consumer`);
    const Consumer = await ethers.getContractFactory("VRFConsumerV2Plus");
    const consumer = await Consumer.deploy(coordinatorAddress, linkTokenAddress);
    await consumer.waitForDeployment();
    const consumerAddress = await consumer.getAddress();

    // 10 create subscritpitoin, add consumer and funding
    // Approve the consumer contract to spend your LINK
/*     const approveTx = await linkToken.approve(consumerAddress, ethers.parseEther("2"));
    await approveTx.wait();

    console.log("Creating subscription, adding consumer and funding...");
    const subTx = await consumer.createSubscriptionAndFund(2)
    await subTx.wait()

    const subId = await consumer.s_subId() */

    const deployment: VRFDeployment = {
      contracts: {
        blockHashStore: bhsAddress,
        batchBlockHashStore: batchBHSAddress,
        coordinator: coordinatorAddress,
        batchCoordinator: batchCoordinatorAddress,
        linkToken: linkTokenAddress,
        linkEthFeed: linkEthFeedAddress,
        testConsumer: consumerAddress
      },
      subscription: {
        id: "0",
        funded: {
          link: ethers.formatEther(2),
          native: ethers.formatEther(0)
        },
        consumer: consumerAddress
      },
      config: {
        fallbackWeiPerUnitLink: config.FALLBACK_WEI_PER_UNIT_LINK,
        minimumConfirmations: config.MIN_CONFIRMATIONS,
        maxGasLimit: config.MAX_GAS_LIMIT,
        stalenessSeconds: config.STALENESS_SECONDS
      }
    };
      
    // Output formatted JSON to console
    console.log("\nDEPLOYMENT_JSON_BEGIN");
    console.log(JSON.stringify(deployment, null, 2));
    console.log("DEPLOYMENT_JSON_END");
    
    //console.log("\nExample commands to interact with contracts:");
    //console.log(`Request randomness: npx hardhat request-randomness --consumer ${consumerAddress} --subid ${subId} --network bloctopus`);
    
    return deployment;
  } catch (error) {
    console.error("Error during deployment:", error);
    throw error;
  }
}

// Execute script
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export default main; 