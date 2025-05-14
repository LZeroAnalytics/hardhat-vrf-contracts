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