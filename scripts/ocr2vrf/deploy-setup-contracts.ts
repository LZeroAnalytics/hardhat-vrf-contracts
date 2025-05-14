import path from "path";
import fs from "fs";  
import { ethers } from "hardhat";
import { getorSetupLinkTokenAndFeed } from "../utils/contract-utils";

async function main() {
    /* ───────────────────── 1) Extract and validate env vars ───────────────────────────── */
    if (process.env.DKG_KEY_ID && process.env.DKG_KEY_ID.length !== 64) {
        throw new Error(`DKG key ID must be 64 hex chars (no 0x): ${process.env.DKG_KEY_ID}`);
    }
    const { linkTokenAddress } = await getorSetupLinkTokenAndFeed(process.env.LINK_TOKEN_ADDRESS, process.env.LINK_NATIVE_TOKEN_FEED_ADDRESS );
    const signer = (await ethers.getSigners())[0];
    /* ───────────────────── 2) Deploy coordinator ───────────────────────────── */
    const { abi: coordinatorAbi, bytecode: coordinatorBytecode } = JSON.parse(fs.readFileSync(path.join(__dirname, `../../contracts/ocr2vrf-artifacts/VRFCoordinatorMPC-artifact.json`), 'utf8'));
    const VRFCoordinatorMPC: any = await (new ethers.ContractFactory(coordinatorAbi, coordinatorBytecode, signer)).deploy(1, linkTokenAddress);
    await VRFCoordinatorMPC.waitForDeployment();
    const vrfCoordinatorMPCAddress = await VRFCoordinatorMPC.getAddress();
    /* ───────────────────── 3) Deploy DKG.sol ───────────────────────────── */
    const { abi: dkgAbi, bytecode: dkgBytecode } = JSON.parse(fs.readFileSync(path.join(__dirname, `../../contracts/ocr2vrf-artifacts/DKG-artifact.json`), 'utf8'));
    const dkg: any = await (new ethers.ContractFactory(dkgAbi, dkgBytecode, signer)).deploy();
    await dkg.waitForDeployment();
    const dkgAddress = await dkg.getAddress();
    /* ───────────────────── 3) Deploy VRFBeacon.sol ───────────────────────────── */
    const { abi, bytecode } = JSON.parse(fs.readFileSync(path.join(__dirname, `../../contracts/ocr2vrf-artifacts/VRFBeacon-artifact.json`), 'utf8'));
    const vrfBeacon: any = await (new ethers.ContractFactory(abi, bytecode, signer)).deploy(linkTokenAddress, vrfCoordinatorMPCAddress, dkgAddress, "0x" + process.env.DKG_KEY_ID);
    await vrfBeacon.waitForDeployment();
    const vrfBeaconAddress = await vrfBeacon.getAddress();
    /* ───────────────────── 3) Set Beacon as DKG client ───────────────────────────── */
    const clientTx = await dkg.addClient("0x" + process.env.DKG_KEY_ID, vrfBeaconAddress);
    await clientTx.wait();
    /* ───────────────────── 4) Set Beacon as VRF Coordinator producer ───────────────────────────── */
    const tx = await VRFCoordinatorMPC.setProducer(vrfBeaconAddress);
    await tx.wait();

    //IMPORTANT: You still need to call setConfig on both dkg and beacon contract, however the payload encoding is very complex, for this we use a dedicated go cli from chailink main repo
    console.log(JSON.stringify({ vrfCoordinatorMPC: vrfCoordinatorMPCAddress, dkg: dkgAddress, vrfBeacon: vrfBeaconAddress }));
}

main();