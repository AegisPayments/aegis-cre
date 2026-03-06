#!/usr/bin/env node
/**
 * EIP-712 Signature Generation for Aegis Protocol Testing
 *
 * This script generates valid EIP-712 signatures for the authorize function
 * that can be used to test the CRE workflow.
 */

import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { sigGenSamples } from "./payloads/samples/signature-gen-test-samples.js";

import dotenv from "dotenv";
dotenv.config();

// Test configuration
const CONFIG = {
  // Test private key (DO NOT USE IN PRODUCTION)
  PRIVATE_KEY:
    //   "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    // PUBLIC KEY DERIVED FROMTHIS - 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
    process.env.DEV_WALLET_PRIVATE_KEY, // * Using the dev wallet 0x9F77cBDb561aaD32b403695306e3eea53F9B40e7 instead of a randomly generated one.

  // Contract configuration (update these to match your deployment)
  CONTRACT_ADDRESS: "0x41259482E8F1b654e4E7d3d0DCF12B28670c5d44", // Replace with actual contract address
  CHAIN_ID: 11155111, // Sepolia testnet
  CONTRACT_NAME: "AegisProtocol",
  CONTRACT_VERSION: "1.0",

  // Test scenarios
  TEST_SCENARIOS: sigGenSamples,
};

/**
 * EIP-712 Domain for Aegis Protocol
 * Must match the domain used in the smart contract
 */
const EIP712_DOMAIN = {
  name: CONFIG.CONTRACT_NAME,
  version: CONFIG.CONTRACT_VERSION,
  chainId: CONFIG.CHAIN_ID,
  verifyingContract: CONFIG.CONTRACT_ADDRESS,
};

/**
 * EIP-712 Types for Authorization
 * Must match the struct used in smart contract's _getAuthorizationHash
 */
const AUTHORIZATION_TYPES = {
  Authorization: [
    { name: "user", type: "address" },
    { name: "merchant", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
};

/**
 * Generate EIP-712 signature for authorization
 */
async function generateAuthorizationSignature(
  user,
  merchant,
  amount,
  nonce,
  privateKey,
) {
  const wallet = new ethers.Wallet(privateKey);

  const message = {
    user,
    merchant,
    amount,
    nonce,
  };

  console.log("\\n📝 Generating signature for:");
  console.log("   User:", user);
  console.log("   Merchant:", merchant);
  console.log("   Amount:", amount);
  console.log("   Nonce:", nonce);

  try {
    const signature = await wallet.signTypedData(
      EIP712_DOMAIN,
      AUTHORIZATION_TYPES,
      message,
    );
    console.log("✅ Signature generated:", signature);
    return signature;
  } catch (error) {
    console.error("❌ Signature generation failed:", error);
    throw error;
  }
}

/**
 * Verify signature locally (for testing)
 */
function verifySignature(user, merchant, amount, nonce, signature) {
  try {
    const message = {
      user,
      merchant,
      amount,
      nonce,
    };

    const recoveredAddress = ethers.verifyTypedData(
      EIP712_DOMAIN,
      AUTHORIZATION_TYPES,
      message,
      signature,
    );
    const isValid = recoveredAddress.toLowerCase() === user.toLowerCase();

    console.log("\\n🔍 Signature verification:");
    console.log("   Expected signer:", user);
    console.log("   Recovered signer:", recoveredAddress);
    console.log("   Valid:", isValid ? "✅" : "❌");

    return isValid;
  } catch (error) {
    console.error("❌ Signature verification failed:", error);
    return false;
  }
}

/**
 * Create test payload for CRE authorize function
 */
function createAuthorizePayload(
  user,
  merchant,
  amount,
  nonce,
  signature,
  merchantType = "RETAIL",
) {
  return {
    functionName: "authorize",
    merchantType,
    user,
    merchant,
    amount,
    nonce,
    signature,
  };
}

/**
 * Save test payloads to files
 */
function saveTestPayloads(payloads) {
  const payloadsDir = path.join(process.cwd(), "payloads", "generated");

  // Ensure directory exists
  if (!fs.existsSync(payloadsDir)) {
    fs.mkdirSync(payloadsDir, { recursive: true });
  }

  payloads.forEach((payload, index) => {
    const filename = `authorize-test-${index + 1}.json`;
    const filepath = path.join(payloadsDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(payload, null, 2));
    console.log(`💾 Saved test payload: ${filename}`);
  });
}

/**
 * Main test function
 */
async function main() {
  console.log("🚀 Starting EIP-712 Signature Generation for Aegis Protocol");
  console.log("=".repeat(60));

  console.log("\\n📋 Configuration:");
  console.log("   Contract Name:", CONFIG.CONTRACT_NAME);
  console.log("   Contract Version:", CONFIG.CONTRACT_VERSION);
  console.log("   Chain ID:", CONFIG.CHAIN_ID);
  console.log("   Contract Address:", CONFIG.CONTRACT_ADDRESS);

  const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY);
  console.log("   Test Signer:", wallet.address);

  const testPayloads = [];

  for (const [index, scenario] of CONFIG.TEST_SCENARIOS.entries()) {
    console.log("\\n" + "=".repeat(60));
    console.log(`🧪 Test Scenario ${index + 1}: ${scenario.name}`);
    console.log("=".repeat(60));

    try {
      // Generate signature
      const signature = await generateAuthorizationSignature(
        scenario.user,
        scenario.merchant,
        scenario.amount,
        scenario.nonce,
        CONFIG.PRIVATE_KEY,
      );

      // Verify signature
      const isValid = verifySignature(
        scenario.user,
        scenario.merchant,
        scenario.amount,
        scenario.nonce,
        signature,
      );

      if (!isValid) {
        throw new Error("Signature verification failed");
      }

      // Create test payload
      const payload = createAuthorizePayload(
        scenario.user,
        scenario.merchant,
        scenario.amount,
        scenario.nonce,
        signature,
        scenario.merchantType || "RETAIL",
      );

      testPayloads.push(payload);

      console.log("\\n✅ Test scenario completed successfully");
    } catch (error) {
      console.error(`❌ Test scenario ${index + 1} failed:`, error.message);
    }
  }

  // Save all test payloads
  console.log("\\n" + "=".repeat(60));
  console.log("💾 Saving Test Payloads");
  console.log("=".repeat(60));
  saveTestPayloads(testPayloads);

  console.log("\\n🎉 Signature generation completed!");
  console.log(
    `Generated ${testPayloads.length} test payloads for CRE testing.`,
  );
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });
}
