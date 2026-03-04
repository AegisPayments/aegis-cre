#!/usr/bin/env node
/**
 * Minimal EIP-712 Signature Generator for Aegis Protocol
 *
 * Usage:
 *   cat payload.json | node generate-signature.js
 *   node generate-signature.js payload.json
 */

import { ethers } from "ethers";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

// Configuration
const CONFIG = {
  PRIVATE_KEY: process.env.CRE_ETH_PRIVATE_KEY,
  CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS,
  CHAIN_ID: 11155111, // Sepolia testnet
  CONTRACT_NAME: "AegisProtocol",
  CONTRACT_VERSION: "1.0",
};

// EIP-712 Domain
const EIP712_DOMAIN = {
  name: CONFIG.CONTRACT_NAME,
  version: CONFIG.CONTRACT_VERSION,
  chainId: CONFIG.CHAIN_ID,
  verifyingContract: CONFIG.CONTRACT_ADDRESS,
};

// EIP-712 Types
const AUTHORIZATION_TYPES = {
  Authorization: [
    { name: "user", type: "address" },
    { name: "merchant", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
};

/**
 * Generate EIP-712 signature
 */
async function generateSignature(user, merchant, amount, nonce) {
  if (!CONFIG.PRIVATE_KEY) {
    throw new Error("DEV_WALLET_PRIVATE_KEY not found in environment");
  }

  const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY);

  const message = {
    user,
    merchant,
    amount: BigInt(amount),
    nonce: BigInt(nonce),
  };

  const signature = await wallet.signTypedData(
    EIP712_DOMAIN,
    AUTHORIZATION_TYPES,
    message,
  );

  return signature;
}

/**
 * Read JSON input from file or stdin
 */
async function readInput() {
  const args = process.argv.slice(2);

  if (args.length > 0) {
    // Read from file
    const filename = args[0];
    const content = fs.readFileSync(filename, "utf8");
    return JSON.parse(content);
  } else {
    // Read from stdin
    let input = "";
    process.stdin.setEncoding("utf8");

    for await (const chunk of process.stdin) {
      input += chunk;
    }

    return JSON.parse(input);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    const data = await readInput();

    // Extract required fields
    const { user, merchant, amount, nonce } = data;

    if (!user || !merchant || amount === undefined || nonce === undefined) {
      throw new Error("Missing required fields: user, merchant, amount, nonce");
    }

    // Generate signature
    const signature = await generateSignature(user, merchant, amount, nonce);

    // Output just the signature
    console.log(signature);
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
