// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Import Chainlink contracts we need to deploy

// Batch contracts
import "@chainlink/contracts/src/v0.8/vrf/BatchBlockhashStore.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/BatchVRFCoordinatorV2Plus.sol";

// Chain-specific VRF coordinators
import "@chainlink/contracts/src/v0.8/vrf/dev/VRFCoordinatorV2_5_Arbitrum.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/VRFCoordinatorV2_5_Optimism.sol";

// Consumer contracts
import "@chainlink/contracts/src/v0.8/vrf/testhelpers/VRFConsumerV2Plus.sol";