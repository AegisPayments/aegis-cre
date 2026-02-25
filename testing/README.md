# Aegis CRE Workflow Testing Framework

This testing framework provides comprehensive tools for testing the Aegis Protocol CRE workflow, including both the `authorize` and `secureIncrement` functions.

## 🏗️ **Directory Structure**

```
testing/
├── package.json                     # Node.js dependencies
├── test-signature-generation.js     # EIP-712 signature generator
├── test-authorize-workflow.js       # Authorize function tester
├── test-secure-increment-workflow.js # SecureIncrement function tester
├── run-all-tests.js                 # Master test orchestrator
├── test-reports/                    # Generated test reports
└── payloads/                        # Test payload files
    ├── authorize-*.json             # Authorize function payloads
    └── secure-increment-*.json      # SecureIncrement function payloads
```

## 🚀 **Quick Start**

### 1. **Setup Dependencies**

```bash
cd testing
npm install
```

### 2. **Run Complete Test Suite**

```bash
npm run test:all
# or
node run-all-tests.js
```

This will:

1. 🔐 Generate EIP-712 signatures for authorize function
2. 🔒 Test authorize workflow
3. 🤖 Test secureIncrement workflow
4. 📄 Generate comprehensive test report

### 3. **Run Individual Tests**

```bash
# Generate signatures only
npm run test:signatures

# Test authorize workflow only
npm run test:authorize

# Test secureIncrement workflow only
npm run test:secure-increment
```

## 📋 **Test Scripts**

### **test-signature-generation.js**

Generates valid EIP-712 signatures for the authorize function.

**Features:**

- 🔐 Creates EIP-712 compliant signatures
- ✅ Local signature verification
- 📄 Generates multiple test scenarios
- 💾 Saves signed payloads for testing

**Configuration:**

```javascript
const CONFIG = {
  PRIVATE_KEY:
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  CONTRACT_ADDRESS: "0x1234567890123456789012345678901234567890", // Update this
  CHAIN_ID: 11155111, // Sepolia
  CONTRACT_NAME: "AegisProtocol",
  CONTRACT_VERSION: "1",
};
```

### **test-authorize-workflow.js**

Tests the authorize function through CRE workflow simulation.

**Features:**

- 🔍 Payload validation and analysis
- 🚀 CRE workflow simulation execution
- 📊 Detailed result analysis
- ⏱️ Timeout handling

### **test-secure-increment-workflow.js**

Tests the secureIncrement function with AI risk assessment.

**Features:**

- 🤖 AI risk engine testing
- 📈 Transaction history simulation
- 🎯 Decision analysis
- 📝 Comprehensive logging

### **run-all-tests.js**

Master orchestrator for the complete test suite.

**Features:**

- 🔧 Prerequisites checking
- 📊 Comprehensive reporting
- ⏱️ Performance tracking
- 📄 Multiple report formats (JSON & Markdown)

## 📄 **Payload Formats**

### **Authorize Function**

```json
{
  "functionName": "authorize",
  "user": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "merchant": "0x0987654321098765432109876543210987654321",
  "amount": 100,
  "nonce": 1,
  "signature": "0x..." // EIP-712 signature
}
```

### **SecureIncrement Function**

```json
{
  "functionName": "secureIncrement",
  "merchantType": "EV_CHARGER", // or "RETAIL", "RIDE_SHARE"
  "user": "0x1234567890123456789012345678901234567890",
  "merchant": "0x0987654321098765432109876543210987654321",
  "currentAuth": 50,
  "requestedTotal": 75,
  "reason": "Additional charging time needed"
}
```

## 🔐 **EIP-712 Signature Generation**

### **Domain Structure**

```javascript
const EIP712_DOMAIN = {
  name: "AegisProtocol",
  version: "1",
  chainId: 11155111, // Sepolia
  verifyingContract: "0x...", // Your contract address
};
```

### **Message Types**

```javascript
const AUTHORIZATION_TYPES = {
  Authorization: [
    { name: "user", type: "address" },
    { name: "merchant", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
};
```

### **Usage Example**

```javascript
const signature = await wallet.signTypedData(
  EIP712_DOMAIN,
  AUTHORIZATION_TYPES,
  {
    user: "0x...",
    merchant: "0x...",
    amount: 100,
    nonce: 1,
  },
);
```

## 🛠️ **Configuration**

### **Update Contract Address**

Before testing, update the contract address in:

1. **test-signature-generation.js**:

   ```javascript
   CONTRACT_ADDRESS: "0xYourActualContractAddress";
   ```

2. **CRE workflow config** (config.json):
   ```json
   {
     "evmConfigs": [
       {
         "contractAddress": "0xYourActualContractAddress"
       }
     ]
   }
   ```

### **Update Chain Configuration**

For different networks, update:

- `CHAIN_ID` in test scripts
- `chainSelectorName` in CRE config
- RPC endpoints as needed

## 📊 **Test Analysis**

### **Success Indicators**

**Authorize Function:**

- ✅ Valid routing to authorize handler
- ✅ Signature verification passes
- ✅ Transaction execution succeeds
- ✅ Firestore logging completes

**SecureIncrement Function:**

- ✅ Valid routing to secureIncrement handler
- ✅ Transaction history fetched
- ✅ AI assessment completed
- ✅ Decision made (YES/NO)
- ✅ Transaction executed (if approved)
- ✅ Risk assessment logged

### **Common Issues**

1. **Signature Generation Fails**
   - Check private key format
   - Verify EIP-712 domain matches contract
   - Ensure nonce is correct

2. **CRE Simulation Fails**
   - Check CRE CLI installation: `cre --version`
   - Verify workflow directory exists
   - Check payload file formatting

3. **Transaction Execution Fails**
   - Verify contract address is correct
   - Check gas limit configuration
   - Ensure test network is accessible

## 🔧 **Prerequisites**

- **CRE CLI**: Install from [cre.chain.link](https://cre.chain.link)
- **Node.js**: Version 18+ recommended
- **ethers.js**: For EIP-712 signature generation

## 📝 **Sample Workflow**

1. **Generate Signatures**:

   ```bash
   node test-signature-generation.js
   ```

2. **Test Individual Functions**:

   ```bash
   # Test authorize with generated signatures
   node test-authorize-workflow.js

   # Test AI risk assessment
   node test-secure-increment-workflow.js
   ```

3. **Review Results**:
   - Check console output for detailed execution logs
   - Review generated test reports in `test-reports/`
   - Analyze transaction hashes and AI decisions

## 🎯 **Expected Test Output**

### **Successful Authorize Test**

```
🔐 Starting Authorize Workflow Tests
✅ CRE simulation completed successfully
📊 Test Result Analysis
   Routing: ✅
   Processing: ✅
   Transaction: ✅
   Logging: ✅
   Transaction Hash: 0x123...
```

### **Successful SecureIncrement Test**

```
🤖 Starting SecureIncrement Workflow Tests
✅ CRE simulation completed successfully
📊 Test Result Analysis
   Routing: ✅
   Risk Processing: ✅
   History Fetch: ✅
   AI Assessment: ✅
   Decision: ✅
   AI Verdict: ✅ APPROVED
   Confidence: 8500/10000 (85.0%)
   Transaction Hash: 0x456...
```

## 🚨 **Important Notes**

1. **Test Keys**: The included private key is for testing only. Never use it in production.

2. **Contract Address**: Update the contract address in test scripts to match your deployment.

3. **Network Configuration**: Ensure CRE workflow is configured for the correct test network.

4. **API Keys**: For full testing, ensure Firebase and Gemini API keys are configured in CRE secrets.

5. **Gas Limits**: Adjust gas limits in CRE config if transactions fail due to out-of-gas errors.

## 📞 **Support**

For issues with the testing framework:

1. Check the generated test reports for detailed error analysis
2. Verify all prerequisites are met
3. Ensure contract address and network configuration are correct
4. Review CRE simulation logs for specific error details

---

**🎉 Happy Testing!** This framework ensures your Aegis Protocol CRE workflow is production-ready with comprehensive testing coverage.
