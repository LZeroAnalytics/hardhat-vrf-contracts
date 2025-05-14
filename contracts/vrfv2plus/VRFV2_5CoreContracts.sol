// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Import Chainlink contracts we need to deploy

// Basic VRF contracts
import "@chainlink/contracts/src/v0.8/vrf/dev/BlockhashStore.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/VRFCoordinatorV2_5.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/testhelpers/VRFCoordinatorTestV2_5.sol";

// Batch operations
import "@chainlink/contracts/src/v0.8/vrf/testhelpers/VRFMockETHLINKAggregator.sol";

// Support contracts
import "@chainlink/contracts/src/v0.8/shared/token/ERC677/LinkToken.sol";

