import {
  cre,
  Runner,
  getNetwork,
  type Runtime,
  type HTTPPayload,
  bytesToHex,
  hexToBase64,
  TxStatus,
  decodeJson
} from "@chainlink/cre-sdk";
import { encodeAbiParameters, parseAbiParameters } from "viem";

// Define config schema
type Config = {
  evmConfigs: Array<{
    chainSelectorName: string;
    contractAddress: string;
  }>;
};

// ABI parameters for captureFunds function
const CAPTURE_FUNDS_PARAMS = parseAbiParameters("address userAddress, uint256 finalAmount");

const onHttpTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  runtime.log("AegisPay: HTTP Trigger - Fund Capture");
  runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    // ─────────────────────────────────────────────────────────────
    // Step 1: Parse and validate the incoming payload
    // ─────────────────────────────────────────────────────────────
    if (!payload.input || payload.input.length === 0) {
      runtime.log("[ERROR] Empty request payload");
      return "Error: Empty request";
    }

    const inputData = decodeJson(payload.input) as { userAddress: string; finalAmount: string };
    runtime.log(`[Step 1] Processing capture for user: ${inputData.userAddress}, amount: ${inputData.finalAmount}`);

    if (!inputData.userAddress || !inputData.finalAmount) {
      runtime.log("[ERROR] Missing required fields: userAddress and finalAmount");
      return "Error: Missing required fields";
    }

    // ─────────────────────────────────────────────────────────────
    // Step 2: Get network and create EVM client
    // ─────────────────────────────────────────────────────────────
    const evmConfig = runtime.config.evmConfigs[0];
    if (!evmConfig) {
      throw new Error("No EVM configuration found");
    }

    const network = getNetwork({
      chainFamily: "evm",
      chainSelectorName: evmConfig.chainSelectorName,
      isTestnet: true,
    });

    if (!network) {
      throw new Error(`Unknown chain: ${evmConfig.chainSelectorName}`);
    }

    runtime.log(`[Step 2] Target chain: ${evmConfig.chainSelectorName}`);
    runtime.log(`[Step 2] Contract address: ${evmConfig.contractAddress}`);

    const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

    // ─────────────────────────────────────────────────────────────
    // Step 3: Encode the capture data for the smart contract
    // ─────────────────────────────────────────────────────────────
    runtime.log("[Step 3] Encoding capture data...");

    const reportData = encodeAbiParameters(
      CAPTURE_FUNDS_PARAMS,
      [inputData.userAddress as `0x${string}`, BigInt(inputData.finalAmount)]
    );

    // ─────────────────────────────────────────────────────────────
    // Step 4: Generate a signed CRE report
    // ─────────────────────────────────────────────────────────────
    runtime.log("[Step 4] Generating CRE report...");

    const reportResponse = runtime
      .report({
        encodedPayload: hexToBase64(reportData),
        encoderName: "evm",
        signingAlgo: "ecdsa",
        hashingAlgo: "keccak256",
      })
      .result();

    // ─────────────────────────────────────────────────────────────
    // Step 5: Write the report to the smart contract
    // ─────────────────────────────────────────────────────────────
    runtime.log(`[Step 5] Writing to contract: ${evmConfig.contractAddress}`);

    const writeResult = evmClient
      .writeReport(runtime, {
        receiver: evmConfig.contractAddress,
        report: reportResponse,
        gasConfig: {
          gasLimit: "2000000",
        },
      })
      .result();

    // ─────────────────────────────────────────────────────────────
    // Step 6: Check result and return transaction hash
    // ─────────────────────────────────────────────────────────────
    if (writeResult.txStatus === TxStatus.SUCCESS) {
      const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32));
      runtime.log(`[Step 6] ✓ Transaction successful: ${txHash}`);
      runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      return txHash;
    }

    throw new Error(`Transaction failed with status: ${writeResult.txStatus}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    runtime.log(`[ERROR] ${msg}`);
    runtime.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    throw err;
  }
};

const initWorkflow = (config: Config) => {
  // Initialize HTTP capability
  const httpCapability = new cre.capabilities.HTTPCapability();
  const httpTrigger = httpCapability.trigger({});

  return [
    // HTTP Trigger - Fund Capture
    cre.handler(httpTrigger, onHttpTrigger),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
