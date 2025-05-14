import { ethers } from "hardhat";
import type { Contract, ContractTransaction } from "ethers";
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

export async function runTxWithErrorParser<T extends ContractTransaction>(
  txPromise: Promise<T>,
  contract: Contract
): Promise<T> {
  
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
export function encodeOnChainVRFProvingKey(uncompressedPubKey: string): { 
  keyHash: string, 
  compressed: string,
  coordinates: [string, string]
} {
  // Convert uncompressed public key to compressed form for on-chain registration
  // Uncompressed key is in format: 0x04 + x + y or just x + y
  let pubKeyBytes: string;
  
  if (uncompressedPubKey.startsWith("0x")) {
    pubKeyBytes = uncompressedPubKey.slice(2);
  } else {
    pubKeyBytes = uncompressedPubKey;
  }
  
  // Ensure the key begins with '04' for uncompressed format if not already
  if (!pubKeyBytes.startsWith("04")) {
    pubKeyBytes = "04" + pubKeyBytes;
  }
  
  // Extract x and y
  const xHex = "0x" + pubKeyBytes.slice(2, 66);
  const yHex = "0x" + pubKeyBytes.slice(66, 130);
  
  // Convert to bigint
  const x = BigInt(xHex);
  const y = BigInt(yHex);
  
  // Determine prefix (02 if y is even, 03 if y is odd)
  const prefix = y % 2n === 0n ? "02" : "03";
  
  // Create compressed key
  const compressedKeyHex = prefix + pubKeyBytes.slice(2, 66);
  const compressedKey = "0x" + compressedKeyHex;
  
  // Calculate key hash
  const keyHash = ethers.keccak256(compressedKey);
  
  return { 
    keyHash, 
    compressed: compressedKey,
    coordinates: [xHex, yHex]
  };
} 