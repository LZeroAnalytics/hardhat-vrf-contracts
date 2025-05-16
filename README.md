# VRF Coordinator Deployment 🎲

> 🔐 Secure and decentralized random number generation using Chainlink VRF

## 📋 Overview

This project contains two VRF (Verifiable Random Function) implementations and deployment scripts:

1. **OCR2VRF (MPC Type)** - Uses Distributed Key Generation and Multi-Party Computation
2. **VRFV2Plus** - Uses traditional blockhash-based VRF with enhanced features

Both implementations enable secure, provably fair random number generation on the blockchain.

## 🚀 Quick Start

<details>
<summary> Prerequisites</summary>

- [Node.js](https://nodejs.org/) and npm installed
- [Hardhat](https://hardhat.org/) environment set up
- Access to an Ethereum node (local or testnet/mainnet)
- [LINK tokens](https://chain.link/) for oracle payments
</details>

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
```

### 🔑 Environment Setup (.ENV)

#### Basic Configuration
| Variable | Description | Example |
|----------|-------------|---------|
| `PRIVATE_KEY` | Private key of the deployer wallet. Needs ETH for gas fees | `<your deployer wallet private key>` |
| `RPC_URL` | Network RPC endpoint. Must be reliable and fast | `<your RPC endpoint>` |

#### Contract Addresses
| Variable | Description | Example |
|----------|-------------|---------|
| `LINK_TOKEN_ADDRESS` | LINK token contract address for oracle payments (**if not provided or left empty, corresponding will be deployed automatically**) | `<your LINK token address>` |
| `LINK_NATIVE_TOKEN_FEED_ADDRESS` | LINK/Native price feed address (**if not provided or left empty, corresponding be deployed automatically**) | `<your LINK/ETH feed address>` |

#### OCR2VRF (MPC Type) Configuration
| Variable | Description | Example |
|----------|-------------|---------|
| `DKG_KEY_ID` | Unique identifier for the DKG key set | `<usually pass the dkg-encr keyId/address of the bootstrap node>` |

#### VRFV2Plus Configuration
| Variable | Description | Example |
|----------|-------------|---------|
| `NETWORK_TYPE` | Network type for specialized coordinators (standard, optimism, arbitrum, base) | `standard` |
| `USE_TEST_COORDINATOR` | Whether to deploy test coordinator | `false` |
| `MIN_CONFIRMATIONS` | Minimum block confirmations for randomness fulfillment | `3` |
| `MAX_GAS_LIMIT` | Maximum gas limit for consumer callbacks | `2500000` |
| `STALENESS_SECONDS` | Maximum feed staleness allowed | `86400` |
| `GAS_AFTER_PAYMENT` | Gas allocated after payment calculation | `50000` |
| `FALLBACK_WEI_PER_UNIT_LINK` | Fallback LINK/ETH price if feed unavailable | `5000000000000000` |
| `FULFILLMENT_FLAT_FEE_LINK_PPM` | Fee in LINK (parts per million) | `500000` |
| `FULFILLMENT_FLAT_FEE_LINK_DISCOUNT_PPM` | Discount for LINK payments (parts per million) | `500000` |
| `NATIVE_PREMIUM_PERCENTAGE` | Premium for native token payments | `0` |
| `LINK_PREMIUM_PERCENTAGE` | Premium for LINK payments | `0` |
| `UNCOMPRESSED_VRF_KEY` | Uncompressed VRF key for proof verification | `<your uncompressed VRF key>` |
| `LINK_FUNDING_AMOUNT` | Amount of LINK to fund subscription with | `10` |
| `NATIVE_FUNDING_AMOUNT` | Amount of native token to fund subscription with | `0.1` |
| `L1_FEE_CALCULATION_MODE` | L1 fee calculation mode (for L2 chains) | `0` |
| `L1_FEE_COEFFICIENT` | L1 fee coefficient (for L2 chains) | `0` |

> 💡 **Tip**: You can get LINK tokens from the Bloctopus Sandbox faucet for testing

&nbsp;
## 🚢 OCR2VRF (MPC Type) Deployment

The OCR2VRF implementation uses Multi-Party Computation (MPC) and Distributed Key Generation (DKG) for enhanced security.

```bash
npx hardhat run scripts/ocr2vrf/deploy-setup-contracts.ts --network blocktopus
```

### Key Components
- `VRFCoordinatorMPC`: Main coordinator contract using Multi-Party Computation
- `DKG.sol`: Handles distributed key generation for secure randomness
- `VRFBeacon.sol`: Provides verifiable random values for consumers

### ⚙️ Deployment Process

#### 1️⃣ Coordinator Deployment
- Deploys VRFCoordinatorMPC with fault tolerance parameter
- Links to LINK token contract

#### 2️⃣ DKG Contract Deployment
- Deploys DKG contract for secure multi-party key generation
- Sets up secure communication between oracles

#### 3️⃣ VRF Beacon Deployment
- Deploys VRFBeacon linked to coordinator and DKG
- Uses DKG_KEY_ID for unique identification

#### 4️⃣ Configuration Setup
- Registers VRFBeacon as DKG client
- Sets VRFBeacon as producer for the coordinator

> **Important**: Additional configuration needed: After deployment, you must call setConfig on both the DKG and Beacon contracts. The payload encoding for these calls is nontrivial — use the official Chainlink Go CLI tool (from the main repo [here](https://github.com/smartcontractkit/chainlink/blob/dfd239a14a17b15a4b9c6e2009a0d7f1e02dea31/core/scripts/ocr2vrf/main.go#L92))


### Randomness Access
Unlike VRFV2Plus which uses `requestRandomWords()`, OCR2VRF uses a `redeemRandomness()` pattern where beacons emit randomness that can be redeemed by consumers.

&nbsp;
## 🚢 VRFV2Plus Deployment

VRFV2Plus enhances the traditional VRF model with additional features and optimization.

```bash
npx hardhat run scripts/vrfv2plus/deploy-setup-contracts.ts --network blocktopus
```

### Key Components
- `BlockhashStore`: Stores historical blockhashes for randomness verification
- `BatchBlockhashStore`: Allows batch operations for efficiency
- `VRFCoordinatorV2_5`: Main coordinator with network-specific implementations
- `BatchVRFCoordinatorV2Plus`: Enables batch operations for requesting randomness

### ⚙️ Deployment Process

#### 1️⃣ BlockhashStore Deployment
- Deploys store for historical block hash verification
- Deploys BatchBlockhashStore for efficient operations

#### 2️⃣ Network-Specific Coordinator Deployment
- Deploys appropriate coordinator based on network type:
  - Standard VRFCoordinatorV2_5
  - Optimism-specific with L1 fee calculation
  - Arbitrum-specific with L2 optimizations
  - Test coordinator for development

#### 3️⃣ Batch Coordinator Deployment
- Deploys BatchVRFCoordinatorV2Plus for batch operations

#### 4️⃣ LINK Token Configuration
- Uses provided LINK token or deploys a new one
- Sets up LINK/ETH price feed or deploys a mock

#### 5️⃣ Coordinator Configuration
- Sets minimum confirmations, gas limits, pricing, and more
- Configures LINK token and price feed addresses
- Registers VRF proving key for verification

#### 6️⃣ Consumer and Subscription Setup
- Deploys a VRF consumer contract
- Creates and funds a subscription
- Sets up consumer with subscription ID

#### Chain-Specific Coordinator Deployment
The system automatically deploys the appropriate coordinator implementation based on the chain:
- **Optimism**: Uses `VRFCoordinatorV2_5_Optimism` with L1 fee calculations
- **Arbitrum**: Uses `VRFCoordinatorV2_5_Arbitrum` with Arbitrum-specific configurations
- **Other chains**: Uses the standard `VRFCoordinatorV2_5` implementation
- Set `USE_TEST_COORDINATOR=true` to deploy a test coordinator that doesn't require an oracle network. This is useful for fast local testing.


### 🧩 VRFV2Plus: Additional Details

#### Requesting Randomness Test (CLI)
To test the request of randomness from a deployed consumer:

```bash
npx hardhat request-randomness --consumer <CONSUMER_ADDRESS> --subid <SUBSCRIPTION_ID>
```

Options:
- `--numwords <NUMBER>`: Number of random words to request (default: 1)
- `--confirmations <NUMBER>`: Confirmations needed (default: 3)
- `--callbackgas <NUMBER>`: Gas limit for callback (default: 100000)
&nbsp;
## 🧪 Testing VRF Integration

<details>
<summary> Consumer Contract Setup</summary>

Deploy and test the VRF consumers contract to verify the random number generation.

**VRF Implementation Comparison** 📊

| Feature | VRFV2Plus | OCR2VRF |
|---------|-----------|---------|
| Delivery Model | Push-based (automatic) | Pull-based (manual retrieval) |
| Flow Pattern | Request → Automatic callback | Beacon emission → Manual redemption |
| User Experience | Simpler, single transaction flow | Two-step process requiring monitoring |
| Request Function | `requestRandomWords()` | `redeemRandomness()` |
| Behind the Scenes | Direct oracle response | Distributed MPC-based beacon emissions |
| Best For | Most general use cases | High-security applications needing same randomness across multiple consumers |

**Random Number Request** 🎲
   ```solidity
   // VRFV2Plus
   requestRandomWords()
   
   // OCR2VRF
   redeemRandomness()
   ```
   - VRFV2Plus: Requests random words via subscription, automatically delivers result via callback
   - OCR2VRF: Redeems randomness from beacon emissions, requires monitoring for available randomness

</details>

<details>
<summary> Test Parameters</summary>

| Parameter | VRFV2Plus | OCR2VRF |
|-----------|-----------|---------|
| Request Flow | Single call: `requestRandomWords()` (callback-based) | Two-step: `requestRandomness()` then `redeemRandomness()` (pull-based) |
| Gas Parameters | User sets callback gas limit | Beacon sets gas, no callback |
| Confirmations | 3-200 blocks, user-configurable | Determined by beacon output schedule |
| Payment | Subscription-based, pre-funded | Pay-per-request, redeem when ready |

> 💡 **Tip**: Monitor events to track successful fulfillments
</details>

<details>
<summary> Troubleshooting</summary>

Common issues to check:
- Insufficient LINK balance
- Incorrect subscription setup
- High gas price for chosen parameters
- Callback gas limit too low
- Missing or incorrect configuration
</details>

<details>
<summary> 🔗 Additional Resources</summary>

- [Chainlink VRF Documentation](https://docs.chain.link/vrf)
- [Hardhat Documentation](https://hardhat.org/getting-started/)
- [Blocktopus Sandbox Guide](https://docs.blocktopus.io)
- [OCR2 Documentation](https://docs.chain.link/architecture-overview/off-chain-reporting)
</details>
