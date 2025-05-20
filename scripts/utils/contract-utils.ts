import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

/**
 * Sets up LINK token and LINK/ETH feed contracts
 * @param config Configuration with optional addresses
 * @returns Object with addresses and contract instances
 */
export async function getorSetupLinkTokenAndFeed(
  linkTokenAddress: string = "",
  linkEthFeedAddress: string = "",
  fallbackWeiPerUnitLink: string = "6e16"
) {

  let linkTokenContract;
  let linkEthFeedContract;
  
  // Deploy or use existing LINK token
  if (linkTokenAddress && linkTokenAddress !== "") {
    console.log(`Using existing LINK token at ${linkTokenAddress}`);
    const LinkToken = await ethers.getContractFactory("LinkToken");
    linkTokenContract = LinkToken.attach(linkTokenAddress);
  } else {
    console.log("Deploying LINK token...");
    const LinkToken = await ethers.getContractFactory("LinkToken");
    linkTokenContract = await LinkToken.deploy();
    await linkTokenContract.waitForDeployment();
    linkTokenAddress = await linkTokenContract.getAddress();
    console.log(`LINK token deployed to: ${linkTokenAddress}`);
  }
  
  // Deploy or use existing LINK/ETH feed
  if (linkEthFeedAddress && linkEthFeedAddress !== "") {
    console.log(`Using existing LINK/ETH feed at ${linkEthFeedAddress}`);
    const MockETHLINKFeed = await ethers.getContractFactory("VRFMockETHLINKAggregator");
    linkEthFeedContract = MockETHLINKFeed.attach(linkEthFeedAddress);
  } else {
    console.log("Deploying LINK/ETH feed...");
    const MockETHLINKFeed = await ethers.getContractFactory("VRFMockETHLINKAggregator");
    const feedValue = ethers.parseUnits(fallbackWeiPerUnitLink, 0);
    linkEthFeedContract = await MockETHLINKFeed.deploy(feedValue);
    await linkEthFeedContract.waitForDeployment();
    linkEthFeedAddress = await linkEthFeedContract.getAddress();
    console.log(`LINK/ETH feed deployed to: ${linkEthFeedAddress}`);
  }
  
  return {
    linkTokenAddress,
    linkEthFeedAddress,
    linkToken: linkTokenContract,
    linkEthFeed: linkEthFeedContract
  };
} 

export function isValidAddress(address: string): boolean {
  try {
    return ethers.isAddress(address);
  } catch {
    return false;
  }
}

export function validateAddress(address: string, name: string): void {
  if (!isValidAddress(address)) {
    throw new Error(`${name} must be a valid Ethereum address: ${address}`);
  }
}

export async function runTxWithErrorParser(
  txPromise: Promise<object>,
  contract: object
): Promise<object> {
  
  try {
    return await txPromise;
  } catch (e: any) {
    const data = e.data ?? e.error?.data;
    if (data) {
      try {
        const parsed = contract.interface.parseError(data);
        console.error(
          `→ Revert ${parsed?.name}(${parsed?.args.join(", ")})`
        );
      } catch (parseError) {
        console.error("Failed to parse error:", parseError);
      }
    }
    throw e;
  }
}

// Chain detection helpers
export function isArbitrumChain(chainId: number): boolean {
  return [42161, 421613, 421614].includes(chainId); // Arbitrum One, Goerli, Sepolia
}

export function isOPStackChain(chainId: number): boolean {
  return [10, 420, 11155420].includes(chainId); // Optimism, Goerli, Sepolia
}

// Save deployment info to JSON file
export interface VRFDeployment {
  contracts: {
    blockHashStore: string;
    batchBlockHashStore: string;
    coordinator: string;
    batchCoordinator: string;
    linkToken: string;
    linkEthFeed: string;
    dkg?: string;
    vrfBeacon?: string;
    testConsumer: string;
  };
  subscription: {
    id: string;
    funded: {
      link: string;
      native: string;
    };
    consumer: string;
  };
  config: {
    fallbackWeiPerUnitLink: string;
    minimumConfirmations: number;
    maxGasLimit: number;
    stalenessSeconds: number;
    keyHashes?: string[];
  };
}

export function saveDeployment(deployment: VRFDeployment, filename: string): void {
  const deploymentsDir = path.join(process.cwd(), "deployments");
  
  // Create deployments directory if it doesn't exist
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  const filePath = path.join(deploymentsDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(deployment, null, 2));
  console.log(`Deployment saved to ${filePath}`);
}

// Function to encode public keys for the DKG system
export function encodeOnChainVRFProvingKey(uncompressed: string) {
  // drop 0x & optional 04 prefix
  let hex = uncompressed.replace(/^0x/, "");
  if (hex.startsWith("04")) hex = hex.slice(2);

  if (hex.length !== 128) throw new Error("uncompressed key must be 64 bytes");

  const xHex = "0x" + hex.slice(0, 64);
  const yHex = "0x" + hex.slice(64, 128);

  // compressed key (useful for off-chain debugging/tools)
  const yBig = BigInt(yHex);
  const prefix = yBig & 1n ? "03" : "02";
  const compressed = "0x" + prefix + hex.slice(0, 64);

  const keyHash = ethers.keccak256(
    ethers.solidityPacked(["uint256", "uint256"], [xHex, yHex])
  );

  // coordinates array ready for registerProvingKey(uint256[2])
  return {
    keyHash,
    compressed,
    coordinates: [xHex, yHex] as [string, string],
  };
}