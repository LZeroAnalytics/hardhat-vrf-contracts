import { ethers } from "hardhat";

async function main() {
  // Validate required environment variables
  if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY env var not set");
  if (!process.env.RPC_URL) throw new Error("RPC_URL env var not set");

  const signer = (await ethers.getSigners())[0];

  // Show current ETH balance
  const balance = await ethers.provider.getBalance(signer.getAddress());
  console.log(`ETH Balance before wrapping: ${ethers.formatEther(balance)} ETH`);

  // Use mainnet WETH contract address (works on forks)
  const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

  // Minimal WETH ABI
  const wethAbi = [
    "function deposit() payable",
    "function balanceOf(address) view returns (uint256)"
  ];

  // Get WETH contract interface
  const WETH = new ethers.Contract(WETH_ADDRESS, wethAbi, signer);

  // Wrap 1 ETH into WETH
  const tx = await WETH.deposit({ value: ethers.parseEther("1") });
  await tx.wait();

  const wethBalance = await WETH.balanceOf(signer.getAddress());
  console.log(`WETH Balance after wrapping: ${ethers.formatEther(wethBalance)} WETH`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});