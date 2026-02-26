#!/usr/bin/env node
/**
 * CRE Workflow Test Runner for Authorize Function
 *
 * Tests the authorize functionality by running CRE simulation with generated payloads
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";

// Configuration
const CONFIG = {
  CRE_WORKFLOW_PATH: "/home/kal/my_projects/aegispay/aegis-cre/aegis-workflow",
  PAYLOADS_DIR: "./payloads/generated",
  TEST_TIMEOUT: 30000, // 30 seconds
};

/**
 * Run CRE workflow simulation with a specific payload
 */
function runCRESimulation(payloadPath) {
  return new Promise((resolve, reject) => {
    console.log(
      `🚀 Running CRE simulation with payload: ${path.basename(payloadPath)}`,
    );

    // Read payload file and pass as inline JSON
    const payloadContent = fs.readFileSync(payloadPath, "utf8");

    const args = [
      "workflow",
      "simulate",
      CONFIG.CRE_WORKFLOW_PATH,
      "--http-payload",
      payloadContent,
      "--target",
      "local-simulation",
      "--non-interactive",
      "--trigger-index",
      "0",
    ];

    console.log(`   Command: cre ${args.join(" ")}`);

    const creProcess = spawn("cre", args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: process.cwd(),
    });

    let stdout = "";
    let stderr = "";

    creProcess.stdout.on("data", (data) => {
      const output = data.toString();
      stdout += output;
      // Real-time output for monitoring
      process.stdout.write(output);
    });

    creProcess.stderr.on("data", (data) => {
      const output = data.toString();
      stderr += output;
      // Real-time error output
      process.stderr.write(output);
    });

    const timeout = setTimeout(() => {
      creProcess.kill("SIGTERM");
      reject(new Error("CRE simulation timeout"));
    }, CONFIG.TEST_TIMEOUT);

    creProcess.on("close", (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        console.log("✅ CRE simulation completed successfully");
        resolve({ code, stdout, stderr });
      } else {
        console.error(`❌ CRE simulation failed with exit code: ${code}`);
        reject(new Error(`CRE simulation failed: ${stderr || stdout}`));
      }
    });

    creProcess.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start CRE process: ${error.message}`));
    });
  });
}

/**
 * Find authorize test payload files with optional filtering
 */
function findAuthorizePayloads(fileFilters = []) {
  const payloadsDir = path.resolve(CONFIG.PAYLOADS_DIR);

  if (!fs.existsSync(payloadsDir)) {
    console.log(
      "📁 Payloads directory does not exist, run `node test-signature-generation.js` first...",
    );
    return [];
  }

  const files = fs.readdirSync(payloadsDir);
  let authorizePayloads = files
    .filter((file) => file.startsWith("authorize-") && file.endsWith(".json"))
    .map((file) => path.join(payloadsDir, file));

  // Apply file filters if provided
  if (fileFilters.length > 0) {
    authorizePayloads = authorizePayloads.filter((filePath) =>
      fileFilters.some((filter) => path.basename(filePath) === filter),
    );
  }

  return authorizePayloads;
}

/**
 * Create a sample authorize payload if none exist
 */
function createSampleAuthorizePayload() {
  const payloadsDir = path.resolve(CONFIG.PAYLOADS_DIR);

  // Ensure directory exists
  if (!fs.existsSync(payloadsDir)) {
    fs.mkdirSync(payloadsDir, { recursive: true });
  }

  const samplePayload = {
    functionName: "authorize",
    user: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    merchant: "0x0987654321098765432109876543210987654321",
    amount: 100,
    nonce: 1,
    signature:
      "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
  };

  const samplePath = path.join(payloadsDir, "authorize-sample.json");
  fs.writeFileSync(samplePath, JSON.stringify(samplePayload, null, 2));

  console.log("📝 Created sample authorize payload (with dummy signature)");
  console.log(
    "   ⚠️  Run test-signature-generation.js first to get valid signatures",
  );

  return [samplePath];
}

/**
 * Test result analysis
 */
function analyzeTestResult(payloadPath, result) {
  console.log("\\n📊 Test Result Analysis");
  console.log("=".repeat(50));

  const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
  console.log(`📄 Payload: ${path.basename(payloadPath)}`);
  console.log(`👤 User: ${payload.user}`);
  console.log(`🏪 Merchant: ${payload.merchant}`);
  console.log(`💰 Amount: ${payload.amount}`);
  console.log(`🔢 Nonce: ${payload.nonce}`);

  const output = result.stdout;

  // Check for success indicators
  const hasValidRouting = output.includes(
    "Aegis Protocol: Payment Function Router",
  );
  const hasAuthorizeProcessing = output.includes("authorize Processing");
  const hasTransactionHash = output.includes("transaction executed");
  const hasFirestoreLog = output.includes("Authorization logged");

  console.log("\\n🔍 Execution Analysis:");
  console.log(`   Routing: ${hasValidRouting ? "✅" : "❌"}`);
  console.log(`   Processing: ${hasAuthorizeProcessing ? "✅" : "❌"}`);
  console.log(`   Transaction: ${hasTransactionHash ? "✅" : "❌"}`);
  console.log(`   Logging: ${hasFirestoreLog ? "✅" : "❌"}`);

  // Extract transaction hash if present
  const txHashMatch = output.match(/transaction executed: (0x[a-fA-F0-9]+)/);
  if (txHashMatch) {
    console.log(`   Transaction Hash: ${txHashMatch[1]}`);
  }

  // Look for any error messages
  const errorLines = output
    .split("\\n")
    .filter((line) => line.includes("[ERROR]") || line.includes("failed"));

  if (errorLines.length > 0) {
    console.log("\\n⚠️  Errors/Warnings:");
    errorLines.forEach((error) => console.log(`   ${error.trim()}`));
  }
}

/**
 * Display usage information
 */
function displayUsage() {
  console.log(`
🔐 CRE Workflow Test Runner for Authorize Function
${"=".repeat(60)}

Usage:
  node test-authorize-workflow.js [files...]
  node test-authorize-workflow.js --files [files...]
  node test-authorize-workflow.js --help

Examples:
  # Run all tests
  node test-authorize-workflow.js

  # Run specific files
  node test-authorize-workflow.js authorize-test-2.json authorize-test-3.json

  # Using --files flag
  node test-authorize-workflow.js --files authorize-test-2.json authorize-test-3.json

  # Show help
  node test-authorize-workflow.js --help

Options:
  --files     Specify which JSON files to test (optional)
  --help      Show this help message
`);
}

/**
 * Parse command line arguments for file filtering
 */
function parseCommandLineArgs() {
  const args = process.argv.slice(2);

  // Check for help flag
  if (args.includes("--help") || args.includes("-h")) {
    displayUsage();
    process.exit(0);
  }

  const fileFilters = [];

  // Check for --files flag
  const filesIndex = args.indexOf("--files");
  if (filesIndex !== -1) {
    // Get all arguments after --files
    const filesArgs = args.slice(filesIndex + 1);
    fileFilters.push(...filesArgs);
  } else {
    // If no --files flag, treat all arguments as file names
    fileFilters.push(...args);
  }

  return fileFilters;
}

/**
 * Main test function
 */
async function main() {
  console.log("🔐 Starting Authorize Workflow Tests");
  console.log("=".repeat(60));

  // Parse command line arguments
  const fileFilters = parseCommandLineArgs();

  if (fileFilters.length > 0) {
    console.log(`🎯 Filtering for specific files: ${fileFilters.join(", ")}`);
  }

  let payloadFiles = findAuthorizePayloads(fileFilters);

  if (payloadFiles.length === 0) {
    if (fileFilters.length > 0) {
      console.log(
        `📭 No matching authorize payloads found for filters: ${fileFilters.join(", ")}`,
      );
      console.log("   Available files in payloads directory:");
      const allFiles = findAuthorizePayloads();
      allFiles.forEach((file) => {
        console.log(`     - ${path.basename(file)}`);
      });
    } else {
      console.log(
        "📭 No authorize payloads found, Run `node test-signature-generation.js` first..",
      );
    }
    throw new Error(
      "No authorize payloads found. Please run `node test-signature-generation.js` to generate test payloads with valid signatures.",
    );
  }

  console.log(`\\n📋 Found ${payloadFiles.length} payload(s) to test:`);
  payloadFiles.forEach((file, index) => {
    console.log(`   ${index + 1}. ${path.basename(file)}`);
  });

  let passed = 0;
  let failed = 0;

  for (const [index, payloadPath] of payloadFiles.entries()) {
    console.log("\\n" + "=".repeat(60));
    console.log(
      `🧪 Test ${index + 1}/${payloadFiles.length}: ${path.basename(payloadPath)}`,
    );
    console.log("=".repeat(60));

    try {
      const result = await runCRESimulation(payloadPath);
      analyzeTestResult(payloadPath, result);
      passed++;
    } catch (error) {
      console.error("❌ Test failed:", error.message);
      failed++;
    }

    // Add delay between tests
    if (index < payloadFiles.length - 1) {
      console.log("\\n⏳ Waiting 2 seconds before next test...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.log("\\n" + "=".repeat(60));
  console.log("📈 Test Summary");
  console.log("=".repeat(60));
  if (fileFilters.length > 0) {
    console.log(`🎯 Tested Files: ${fileFilters.join(", ")}`);
  }
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${passed + failed}`);

  if (failed === 0) {
    console.log("\\n🎉 All authorize workflow tests passed!");
  } else {
    console.log(
      "\\n⚠️  Some tests failed. Check the output above for details.",
    );
    process.exit(1);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("💥 Test script failed:", error);
    process.exit(1);
  });
}
