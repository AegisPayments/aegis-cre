#!/usr/bin/env node

/**
 * Firebase Connection Test Script
 * Tests Firebase authentication and Firestore write access for AegisPay CRE
 */

const https = require("https");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

// Firebase configuration from environment
const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID_VAR,
  webApiKey: process.env.FIREBASE_API_KEY_VAR,
};

console.log("🔥 Testing AegisPay Firebase Setup...\n");

/**
 * Makes an HTTPS request
 */
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on("error", reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * Get Firebase anonymous auth token
 */
async function getAuthToken() {
  console.log("1️⃣  Testing Firebase Authentication...");

  const options = {
    hostname: "identitytoolkit.googleapis.com",
    path: `/v1/accounts:signUp?key=${firebaseConfig.webApiKey}`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  };

  const data = {
    returnSecureToken: true,
  };

  try {
    const response = await makeRequest(options, data);

    if (response.status === 200 && response.data.idToken) {
      console.log("   ✅ Anonymous authentication successful");
      console.log(
        `   🔑 Token expires in: ${response.data.expiresIn} seconds\n`,
      );
      return response.data.idToken;
    } else {
      throw new Error(
        `Authentication failed: ${JSON.stringify(response.data)}`,
      );
    }
  } catch (error) {
    console.log(`   ❌ Authentication failed: ${error.message}\n`);
    throw error;
  }
}

/**
 * Test Firestore write access
 */
async function testFirestoreWrite(idToken) {
  console.log(`2️⃣  Testing Firestore Write Access to the 'demo' collection...`);

  const timestamp = Date.now();
  const testDoc = {
    fields: {
      testMessage: { stringValue: "AegisPay CRE Firebase Connection Test" },
      timestamp: { integerValue: timestamp.toString() },
      user: { stringValue: "0x1234567890123456789012345678901234567890" },
      merchant: { stringValue: "0x0987654321098765432109876543210987654321" },
      amount: { integerValue: "25" },
      status: { stringValue: "test" },
    },
  };

  const options = {
    hostname: "firestore.googleapis.com",
    path: `/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/demo`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
  };

  try {
    const response = await makeRequest(options, testDoc);

    if (response.status === 200 && response.data.name) {
      console.log("   ✅ Firestore write successful");
      console.log(
        `   📄 Document created: ${response.data.name.split("/").pop()}\n`,
      );
      return response.data.name;
    } else {
      throw new Error(
        `Firestore write failed: ${JSON.stringify(response.data)}`,
      );
    }
  } catch (error) {
    console.log(`   ❌ Firestore write failed: ${error.message}\n`);
    throw error;
  }
}

/**
 * Test all required collections access
 */
async function testCollectionsAccess(idToken) {
  console.log("3️⃣  Testing AegisPay Collections Access...");

  const collections = [
    "authorization-logs",
    "risk-assessments",
    "captured-logs",
    "funds-released-logs",
  ];

  const testResults = [];
  const documentsToCleanup = [];

  for (const collection of collections) {
    try {
      const testDoc = {
        fields: {
          testData: { stringValue: `Test document for ${collection}` },
          timestamp: { integerValue: Date.now().toString() },
        },
      };

      const options = {
        hostname: "firestore.googleapis.com",
        path: `/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/${collection}`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
      };

      const response = await makeRequest(options, testDoc);

      if (response.status === 200) {
        console.log(`   ✅ ${collection}: Write access confirmed`);
        testResults.push({ collection, status: "success" });

        // Store document path for cleanup
        const documentPath = response.data.name;
        documentsToCleanup.push({ path: documentPath, collection });
      } else {
        console.log(`   ❌ ${collection}: Write failed (${response.status})`);
        testResults.push({
          collection,
          status: "failed",
          error: response.data,
        });
      }
    } catch (error) {
      console.log(`   ❌ ${collection}: Error - ${error.message}`);
      testResults.push({ collection, status: "error", error: error.message });
    }
  }

  // Cleanup test documents
  if (documentsToCleanup.length > 0) {
    console.log("\n🧹 Cleaning up test documents...");
    for (const doc of documentsToCleanup) {
      try {
        const deleteOptions = {
          hostname: "firestore.googleapis.com",
          path: `/v1/${doc.path}`,
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        };

        await makeRequest(deleteOptions);
        console.log(`   🗑️  ${doc.collection}: Test document deleted`);
      } catch (error) {
        console.log(
          `   ⚠️  ${doc.collection}: Cleanup failed - ${error.message}`,
        );
      }
    }
  }

  console.log("");
  return testResults;
}

/**
 * Test configuration validation
 */
function testConfiguration() {
  console.log("🔧 Validating Firebase Configuration...\n");

  const errors = [];

  if (!firebaseConfig.projectId) {
    errors.push("Missing FIREBASE_PROJECT_ID_VAR in .env file");
  }

  if (!firebaseConfig.webApiKey) {
    errors.push("Missing FIREBASE_API_KEY_VAR in .env file");
  }

  if (errors.length > 0) {
    console.log("❌ Configuration Errors:");
    errors.forEach((error) => console.log(`   - ${error}`));
    console.log("\n📝 Please add the following to your .env file:");
    console.log("   FIREBASE_PROJECT_ID_VAR=your-firebase-project-id");
    console.log("   FIREBASE_API_KEY_VAR=your-firebase-api-key\n");
    return false;
  }

  console.log("✅ Firebase configuration looks good!\n");
  return true;
}

/**
 * Main test function
 */
async function runTests() {
  try {
    console.log("=".repeat(50));
    console.log("🔥 AegisPay Firebase Connection Test");
    console.log("=".repeat(50));
    console.log("");

    // Test configuration
    if (!testConfiguration()) {
      process.exit(1);
    }

    // Test authentication
    const idToken = await getAuthToken();

    // Test basic Firestore write
    await testFirestoreWrite(idToken);

    // Test all AegisPay collections
    const collectionResults = await testCollectionsAccess(idToken);

    // Summary
    console.log("📊 Test Summary:");
    console.log("=".repeat(30));
    console.log("✅ Firebase Authentication: PASSED");
    console.log("✅ Basic Firestore Write: PASSED");

    const successful = collectionResults.filter(
      (r) => r.status === "success",
    ).length;
    const total = collectionResults.length;

    if (successful === total) {
      console.log("✅ All AegisPay Collections: PASSED");
      console.log(
        "\n🎉 All tests passed! Your Firebase setup is ready for AegisPay CRE.\n",
      );
    } else {
      console.log(`⚠️  AegisPay Collections: ${successful}/${total} passed`);
      console.log(
        "\n⚠️  Some collection tests failed. Check security rules and try again.\n",
      );
    }

    console.log("Next Steps:");
    console.log(
      "1. Run CRE workflow simulation: cre workflow simulate ./aegis-workflow",
    );
    console.log("2. Execute full test suite: cd testing && npm run test:all");
    console.log("3. Check Firebase Console for created test documents");
    console.log("");
  } catch (error) {
    console.log(`\n💥 Test failed with error: ${error.message}`);
    console.log("\nTroubleshooting:");
    console.log("1. Verify your Firebase project ID and API key");
    console.log("2. Check that Anonymous Authentication is enabled");
    console.log("3. Ensure Firestore security rules are configured correctly");
    console.log(
      "4. See docs/firebase-setup.md for detailed setup instructions",
    );
    console.log("");
    process.exit(1);
  }
}

// Run the tests
runTests();
