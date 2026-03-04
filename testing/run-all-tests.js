#!/usr/bin/env node
/**
 * Master Test Runner for Aegis CRE Workflow
 *
 * Orchestrates the complete testing flow:
 * 1. Generate EIP-712 signatures for authorize function
 * 2. Test authorize workflow
 * 3. Test secureIncrement workflow
 * 4. Generate comprehensive test report
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";

// Configuration
const CONFIG = {
  TEST_SCRIPTS: {
    signatures: "./test-signature-generation.js",
    authorize: "./test-authorize-workflow.js",
    secureIncrement: "./test-secure-increment-workflow.js",
  },
  REPORTS_DIR: "./test-reports",
};

/**
 * Run a Node.js script and capture output
 */
function runScript(scriptPath, scriptName, shouldBroadcast = false) {
  return new Promise((resolve, reject) => {
    console.log(`🚀 Running ${scriptName}...`);
    console.log(`   Script: ${scriptPath}`);

    const startTime = Date.now();

    const args = [scriptPath];
    if (shouldBroadcast) {
      args.push("--broadcast");
      console.log(`   📡 Broadcasting enabled for ${scriptName}`);
    }

    const nodeProcess = spawn("node", args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: process.cwd(),
    });

    let stdout = "";
    let stderr = "";

    nodeProcess.stdout.on("data", (data) => {
      const output = data.toString();
      stdout += output;
      // Real-time output
      process.stdout.write(output);
    });

    nodeProcess.stderr.on("data", (data) => {
      const output = data.toString();
      stderr += output;
      // Real-time error output
      process.stderr.write(output);
    });

    nodeProcess.on("close", (code) => {
      const duration = Date.now() - startTime;

      if (code === 0) {
        console.log(`✅ ${scriptName} completed successfully (${duration}ms)`);
        resolve({ code, stdout, stderr, duration, scriptName });
      } else {
        console.error(`❌ ${scriptName} failed with exit code: ${code}`);
        reject(new Error(`${scriptName} failed: ${stderr || stdout}`));
      }
    });

    nodeProcess.on("error", (error) => {
      reject(new Error(`Failed to start ${scriptName}: ${error.message}`));
    });
  });
}

/**
 * Check prerequisites and setup
 */
function checkPrerequisites() {
  console.log("🔧 Checking prerequisites...");

  const checks = [];

  // Check if CRE CLI is installed
  try {
    const result = spawn("cre", ["--version"], { stdio: "pipe" });
    checks.push("✅ CRE CLI is installed");
  } catch (error) {
    checks.push("❌ CRE CLI not found - please install it first");
  }

  // Check if package.json exists and dependencies are installed
  const packageJsonPath = "./package.json";
  if (fs.existsSync(packageJsonPath)) {
    checks.push("✅ package.json found");

    const nodeModulesPath = "./node_modules";
    if (fs.existsSync(nodeModulesPath)) {
      checks.push("✅ node_modules found");
    } else {
      checks.push("⚠️  node_modules not found - run: npm install");
    }
  } else {
    checks.push("❌ package.json not found");
  }

  // Check if workflow directory exists
  const workflowPath =
    "/home/kal/my_projects/aegispay/aegis-cre/aegis-workflow";
  if (fs.existsSync(workflowPath)) {
    checks.push("✅ CRE workflow directory found");
  } else {
    checks.push("❌ CRE workflow directory not found");
  }

  checks.forEach((check) => console.log(`   ${check}`));

  const hasErrors = checks.some((check) => check.includes("❌"));
  if (hasErrors) {
    throw new Error("Prerequisites check failed");
  }

  console.log("✅ All prerequisites met");
}

/**
 * Generate test report
 */
function generateTestReport(results) {
  console.log("\\n📄 Generating Test Report...");

  const timestamp = new Date().toISOString();
  const report = {
    timestamp,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.code === 0).length,
      failed: results.filter((r) => r.code !== 0).length,
      totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
    },
    results: results.map((result) => ({
      scriptName: result.scriptName,
      exitCode: result.code,
      duration: result.duration,
      success: result.code === 0,
    })),
  };

  // Ensure reports directory exists
  if (!fs.existsSync(CONFIG.REPORTS_DIR)) {
    fs.mkdirSync(CONFIG.REPORTS_DIR, { recursive: true });
  }

  // Write JSON report
  const jsonReportPath = path.join(
    CONFIG.REPORTS_DIR,
    `test-report-${Date.now()}.json`,
  );
  fs.writeFileSync(jsonReportPath, JSON.stringify(report, null, 2));

  // Write human-readable report
  const textReport = [
    "# Aegis CRE Workflow Test Report",
    `Generated: ${timestamp}`,
    "",
    "## Summary",
    `- Total Tests: ${report.summary.total}`,
    `- Passed: ${report.summary.passed} ✅`,
    `- Failed: ${report.summary.failed} ${report.summary.failed > 0 ? "❌" : ""}`,
    `- Total Duration: ${(report.summary.totalDuration / 1000).toFixed(2)}s`,
    "",
    "## Test Results",
  ];

  results.forEach((result, index) => {
    const status = result.code === 0 ? "✅ PASS" : "❌ FAIL";
    const duration = (result.duration / 1000).toFixed(2);
    textReport.push(
      `${index + 1}. ${result.scriptName}: ${status} (${duration}s)`,
    );
  });

  const textReportPath = path.join(
    CONFIG.REPORTS_DIR,
    `test-report-${Date.now()}.md`,
  );
  fs.writeFileSync(textReportPath, textReport.join("\n"));

  console.log(`📄 Reports generated:`);
  console.log(`   JSON: ${jsonReportPath}`);
  console.log(`   Markdown: ${textReportPath}`);

  return report;
}

/**
 * Parse command line arguments
 */
function parseCommandLineArgs() {
  const args = process.argv.slice(2);

  // Check for help flag
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
🧪 Aegis CRE Workflow - Master Test Runner
${"".repeat(60)}

Usage:
  node run-all-tests.js [--broadcast]
  npm run test:all [-- --broadcast]

Options:
  --broadcast     Enable broadcasting of transactions in all tests
  --help          Show this help message
`);
    process.exit(0);
  }

  // Check for broadcast flag
  const shouldBroadcast = args.includes("--broadcast");

  return { shouldBroadcast };
}

/**
 * Main test orchestration
 */
async function main() {
  console.log("🧪 Aegis CRE Workflow - Master Test Runner");
  console.log("=".repeat(60));
  console.log("This script will run the complete testing suite:");
  console.log("1. 🔐 Generate EIP-712 signatures for authorize function");
  console.log("2. 🔒 Test authorize workflow");
  console.log("3. 🤖 Test secureIncrement workflow");
  console.log("4. 📄 Generate comprehensive test report");
  console.log("=".repeat(60));

  // Parse command line arguments
  const { shouldBroadcast } = parseCommandLineArgs();

  if (shouldBroadcast) {
    console.log(`📡 Broadcasting enabled for all tests`);
  }

  try {
    // Check prerequisites
    checkPrerequisites();

    const results = [];

    // Step 1: Generate signatures
    console.log("\\n" + "=".repeat(60));
    console.log("📝 Step 1: Generating EIP-712 Signatures");
    console.log("=".repeat(60));

    try {
      const sigResult = await runScript(
        CONFIG.TEST_SCRIPTS.signatures,
        "Signature Generation",
      );
      results.push(sigResult);
    } catch (error) {
      console.error(
        "⚠️  Signature generation failed, continuing with existing payloads...",
      );
      results.push({
        code: 1,
        stdout: "",
        stderr: error.message,
        duration: 0,
        scriptName: "Signature Generation",
      });
    }

    // Step 2: Test authorize workflow
    console.log("\\n" + "=".repeat(60));
    console.log("🔒 Step 2: Testing Authorize Workflow");
    console.log("=".repeat(60));

    try {
      const authResult = await runScript(
        CONFIG.TEST_SCRIPTS.authorize,
        "Authorize Workflow",
        shouldBroadcast,
      );
      results.push(authResult);
    } catch (error) {
      console.error("❌ Authorize workflow tests failed");
      results.push({
        code: 1,
        stdout: "",
        stderr: error.message,
        duration: 0,
        scriptName: "Authorize Workflow",
      });
    }

    // Step 3: Test secureIncrement workflow
    console.log("\\n" + "=".repeat(60));
    console.log("🤖 Step 3: Testing SecureIncrement Workflow");
    console.log("=".repeat(60));

    try {
      const secureResult = await runScript(
        CONFIG.TEST_SCRIPTS.secureIncrement,
        "SecureIncrement Workflow",
        shouldBroadcast,
      );
      results.push(secureResult);
    } catch (error) {
      console.error("❌ SecureIncrement workflow tests failed");
      results.push({
        code: 1,
        stdout: "",
        stderr: error.message,
        duration: 0,
        scriptName: "SecureIncrement Workflow",
      });
    }

    // Generate final report
    console.log("\\n" + "=".repeat(60));
    console.log("📊 Final Test Report");
    console.log("=".repeat(60));

    const report = generateTestReport(results);

    console.log(`\\n📊 Test Summary:`);
    console.log(`   Total: ${report.summary.total}`);
    console.log(`   ✅ Passed: ${report.summary.passed}`);
    console.log(`   ❌ Failed: ${report.summary.failed}`);
    console.log(
      `   ⏱️  Duration: ${(report.summary.totalDuration / 1000).toFixed(2)}s`,
    );

    if (report.summary.failed === 0) {
      console.log("\\n🎉 All tests completed successfully!");
      console.log("🚀 Your Aegis CRE workflow is ready for deployment!");
    } else {
      console.log("\\n⚠️  Some tests failed. Please review the output above.");
      console.log("💡 Check the generated test reports for detailed analysis.");
      process.exit(1);
    }
  } catch (error) {
    console.error("💥 Master test runner failed:", error.message);
    process.exit(1);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });
}
