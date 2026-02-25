#!/usr/bin/env node
/**
 * CRE Workflow Test Runner for SecureIncrement Function
 *
 * Tests the secureIncrement functionality by running CRE simulation with test payloads
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";

// Configuration
const CONFIG = {
  CRE_WORKFLOW_PATH: "/home/kal/my_projects/aegispay/aegis-cre/aegis-workflow",
  PAYLOADS_DIR: "./payloads/samples",
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
 * Find all secureIncrement test payload files
 */
function findSecureIncrementPayloads() {
  const payloadsDir = path.resolve(CONFIG.PAYLOADS_DIR);

  if (!fs.existsSync(payloadsDir)) {
    console.log(
      "📁 Payloads directory does not exist, creating sample payloads...",
    );
    return [];
  }

  const files = fs.readdirSync(payloadsDir);
  const secureIncrementPayloads = files
    .filter(
      (file) => file.startsWith("secure-increment-") && file.endsWith(".json"),
    )
    .map((file) => path.join(payloadsDir, file));

  return secureIncrementPayloads;
}

/**
 * Create sample secureIncrement payloads if none exist
 */
function createSampleSecureIncrementPayloads() {
  const payloadsDir = path.resolve(CONFIG.PAYLOADS_DIR);

  // Ensure directory exists
  if (!fs.existsSync(payloadsDir)) {
    fs.mkdirSync(payloadsDir, { recursive: true });
  }

  const samplePayloads = [
    {
      name: "EV Charger Basic",
      payload: {
        functionName: "secureIncrement",
        merchantType: "EV_CHARGER",
        user: "0x1234567890123456789012345678901234567890",
        merchant: "0x0987654321098765432109876543210987654321",
        currentAuth: 50,
        requestedTotal: 75,
        reason: "Additional charging time needed",
      },
    },
    {
      name: "Retail Purchase",
      payload: {
        functionName: "secureIncrement",
        merchantType: "RETAIL",
        user: "0x1111111111111111111111111111111111111111",
        merchant: "0x2222222222222222222222222222222222222222",
        currentAuth: 25,
        requestedTotal: 40,
        reason: "Added items to cart",
      },
    },
    {
      name: "Ride Share Extended",
      payload: {
        functionName: "secureIncrement",
        merchantType: "RIDE_SHARE",
        user: "0x3333333333333333333333333333333333333333",
        merchant: "0x4444444444444444444444444444444444444444",
        currentAuth: 15,
        requestedTotal: 35,
        reason: "Extended trip due to traffic",
      },
    },
  ];

  const createdFiles = [];

  samplePayloads.forEach((sample, index) => {
    const filename = `secure-increment-${index + 1}.json`;
    const filepath = path.join(payloadsDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(sample.payload, null, 2));
    console.log(`📝 Created sample payload: ${filename} (${sample.name})`);
    createdFiles.push(filepath);
  });

  return createdFiles;
}

/**
 * Test result analysis
 */
function analyzeTestResult(payloadPath, result) {
  console.log("\\n📊 Test Result Analysis");
  console.log("=".repeat(50));

  const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
  console.log(`📄 Payload: ${path.basename(payloadPath)}`);
  console.log(`🏪 Merchant Type: ${payload.merchantType}`);
  console.log(`👤 User: ${payload.user}`);
  console.log(`🏪 Merchant: ${payload.merchant}`);
  console.log(`💰 Current Auth: $${payload.currentAuth}`);
  console.log(`💰 Requested: $${payload.requestedTotal}`);
  console.log(`📝 Reason: ${payload.reason}`);

  const output = result.stdout;

  // Check for success indicators
  const hasValidRouting = output.includes("Payment Function Router");
  const hasRiskProcessing = output.includes("secureIncrement Processing");
  const hasHistoryFetch = output.includes("Fetching transaction history");
  const hasAIAssessment = output.includes("Querying Gemini AI");
  const hasDecision = output.includes("AI Decision:");
  const hasTransactionHash = output.includes("transaction executed");
  const hasFirestoreLog = output.includes("Assessment logged");

  console.log("\\n🔍 Execution Analysis:");
  console.log(`   Routing: ${hasValidRouting ? "✅" : "❌"}`);
  console.log(`   Risk Processing: ${hasRiskProcessing ? "✅" : "❌"}`);
  console.log(`   History Fetch: ${hasHistoryFetch ? "✅" : "❌"}`);
  console.log(`   AI Assessment: ${hasAIAssessment ? "✅" : "❌"}`);
  console.log(`   Decision: ${hasDecision ? "✅" : "❌"}`);
  console.log(`   Transaction: ${hasTransactionHash ? "✅" : "❌"}`);
  console.log(`   Logging: ${hasFirestoreLog ? "✅" : "❌"}`);

  // Extract AI decision if present
  const decisionMatch = output.match(/AI Decision: (YES|NO)/);
  if (decisionMatch) {
    const decision = decisionMatch[1];
    console.log(
      `   AI Verdict: ${decision === "YES" ? "✅ APPROVED" : "❌ REJECTED"}`,
    );
  }

  // Extract confidence if present
  const confidenceMatch = output.match(/confidence: (\d+)\/10000/);
  if (confidenceMatch) {
    const confidence = parseInt(confidenceMatch[1]);
    console.log(
      `   Confidence: ${confidence}/10000 (${(confidence / 100).toFixed(1)}%)`,
    );
  }

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
 * Main test function
 */
async function main() {
  console.log("🤖 Starting SecureIncrement Workflow Tests");
  console.log("=".repeat(60));

  let payloadFiles = findSecureIncrementPayloads();

  if (payloadFiles.length === 0) {
    console.log("📭 No secureIncrement payloads found, creating samples...");
    payloadFiles = createSampleSecureIncrementPayloads();
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
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${passed + failed}`);

  if (failed === 0) {
    console.log("\\n🎉 All secureIncrement workflow tests passed!");
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
