import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

// Import tasks
import "./scripts/vrfv2plus/test-randomness-request";

// uncomment if using hardhat only, in this kurtosis project the env vars will be automatically injested from kurtosis
dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.19",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    bloctopus: {
      url: process.env.RPC_URL!,
      chainId: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : undefined,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    }
  },
  defaultNetwork: "bloctopus"
};

export default config;
