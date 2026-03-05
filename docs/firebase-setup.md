# AegisPay Firebase Setup Guide

This guide walks you through setting up Firebase/Firestore for the AegisPay CRE workflow, including database configuration, authentication, and security rules.

---

## 1. Create a Firebase Account & Project

### A. Create Firebase Account

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Sign in with your Google account
3. If you don't have one, you'll be prompted to create it

### B. Create a New Project

1. In the Firebase console, click **"Add project"**
2. Enter project name (e.g., `aegispay-cre-production`)
3. You can disable Google Analytics for a simpler setup
4. Click Create project

### C. Add a Web App

1. Once created, you'll be on the **Project Overview** page
2. Click the **Web icon (</>)** to add a new web app
3. Give it a nickname (e.g., `AegisPay CRE Workflow`)
4. Click **"Register app"**
5. Skip the SDK setup steps, just click **"Continue to console"**

---

## 2. Configure Firestore Database

### A. Create the Database

1. In the left-hand menu, go to **Build → Firestore Database**
2. Click **"Create database"**
3. Choose **"Start in production mode"** → click **Next**
4. Select a location close to your users (e.g., `nam5 (us-central)`)
   > ⚠️ **Important**: This location cannot be changed later
5. Click **Enable**

### B. Configure Required Collections

AegisPay CRE will automatically create these collections when transactions occur:

- **`authorization-logs`** - Payment authorization records
- **`risk-assessments`** - AI risk assessment decisions and reasoning
- **`captured-logs`** - Fund capture event logs from smart contract
- **`funds-released-logs`** - Fund release event logs from smart contract

> 💡 **Note**: You don't need to manually create these collections - the CRE workflow will create them automatically when first used.

---

## 3. Enable Authentication

### A. Enable Anonymous Authentication

1. Go to **Build → Authentication**
2. Click the **"Sign-in method"** tab
3. Find **"Anonymous"** in the list and click it
4. Toggle **Enable**
5. Click **Save**

> 🔐 **Security Note**: The CRE workflow uses Firebase Anonymous Authentication to obtain ID tokens for Firestore access. This is secure because write access is still controlled by authentication tokens.

---

## 4. Configure Security Rules

### A. Apply AegisPay Security Rules

1. Go to **Firestore Database → Rules**
2. Replace the existing rules with the AegisPay-specific rules:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // 🟢 Authorization logs - public read for transparency, authenticated write
    match /authorization-logs/{document} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // 🤖 Risk assessments - public read for audit trail, authenticated write
    match /risk-assessments/{document} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // 📊 Captured funds logs - public read for transparency, authenticated write
    match /captured-logs/{document} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // 🔄 Funds released logs - public read for transparency, authenticated write
    match /funds-released-logs/{document} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // 🟢 Demo collection (for testing purposes)
    match /demo/{document} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // 🔒 All other collections are restricted by default
  }
}
```

3. Click **Publish**

### B. Security Rules Explanation

- **Public Read Access**: Enables transparency for payment audit trails
- **Authenticated Write**: Only allows writes from authenticated sources (the CRE workflow)
- **Collection-Specific**: Each AegisPay collection has its own security rules
- **Default Deny**: All unlisted collections are protected by default

---

## 5. Get Your Configuration Values

### A. Project Credentials

1. Click the **Gear icon (⚙️)** next to "Project Overview"
2. Select **"Project settings"**
3. Under the **General** tab, note these values:

**Project ID**: Found in "Your project" card

- Example: `aegispay-cre-production-a1b2c`
- This becomes your `FIREBASE_PROJECT_ID`

**Web API Key**: Found under "Your apps" → SDK setup

- Example: `"apiKey": "AIz..."`
- This becomes your `FIREBASE_API_KEY`

### B. Service Account (Optional for Advanced Setup)

For production deployments, you may want to set up a service account:

1. Go to **Project Settings → Service Accounts**
2. Click **"Generate new private key"**
3. Download the JSON file securely
4. This can be used for server-side authentication instead of anonymous auth

---

## 6. Configure Your AegisPay CRE Workflow

### A. Update Configuration File

Edit your `aegis-workflow/config.local.json`:

```json
{
  "firebaseConfig": {
    "projectId": "YOUR_PROJECT_ID",
    "webApiKey": "YOUR_WEB_API_KEY"
  },
  "evmConfigs": [
    {
      "chainSelectorName": "ethereum-testnet-sepolia",
      "contractAddress": "0xYourContractAddress"
    }
  ],
  "llmConfig": {
    "provider": "gemini",
    "model": "gemini-1.5-flash",
    "apiKey": "YOUR_LLM_API_KEY"
  }
}
```

### B. Set Environment Variables for Testing

For Firebase connection testing, create a `.env` file in the `testing/` directory:

```bash
# Copy the sample file
cd testing
cp .env.sample .env

# Edit the .env file with your Firebase credentials
```

Add your Firebase credentials to `.env`:

```bash
# Firebase Configuration for AegisPay CRE Testing
FIREBASE_PROJECT_ID_VAR=your-firebase-project-id
FIREBASE_API_KEY_VAR=your-firebase-web-api-key

# Example:
# FIREBASE_PROJECT_ID_VAR=aegispay-cre-development
# FIREBASE_API_KEY_VAR=AIzaSyBkNUy0XPMPU8BQMbyv8PIw2jTEs7o9LO8
```

---

## 7. Test Your Firebase Setup

### A. Test Firebase Connection

Test that your Firebase setup is working correctly:

```bash
# From the testing directory
cd testing
npm install
npm run test:firebase
````

This script will:

1. Validate your `.env` configuration
2. Obtain a Firebase anonymous auth token
3. Test write access to Firestore
4. Verify all required AegisPay collections work correctly
5. Clean up test documents automatically

### B. Manual Test (Optional)

You can manually test Firebase access using curl:

```bash
# Get an anonymous auth token
curl -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$FIREBASE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"returnSecureToken": true}'

# Use the returned idToken to write test data
curl -X POST "https://firestore.googleapis.com/v1/projects/$FIREBASE_PROJECT_ID/databases/(default)/documents/demo" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "fields": {
      "testMessage": { "stringValue": "AegisPay CRE Firebase Test" },
      "timestamp": { "integerValue": "'$(date +%s)'" }
    }
  }'
```

---

## 8. Production Considerations

### A. Security Hardening

For production deployments:

1. **API Key Restrictions**: In Firebase Console → Project Settings → General, restrict your API keys to specific domains/IPs
2. **Audit Logging**: Enable Firebase Audit Logs for compliance tracking
3. **Backup Strategy**: Set up automated Firestore backups

### B. Performance Optimization

1. **Composite Indexes**: Create indexes for common query patterns:

   ```
   Collection: authorization-logs
   Fields: user (Ascending), merchant (Ascending), timestamp (Descending)

   Collection: risk-assessments
   Fields: user (Ascending), decision (Ascending), timestamp (Descending)
   ```

2. **Data Retention**: Set up TTL (Time To Live) policies for log collections if needed

### C. Monitoring

1. **Firebase Performance**: Enable Performance Monitoring in Firebase Console
2. **Alerts**: Set up alerts for unusual database usage patterns
3. **Quotas**: Monitor Firestore quotas and set up billing alerts

---

## 9. Troubleshooting

### Common Issues

#### "Permission Denied" Errors

- Verify your security rules match the ones in this guide
- Check that your ID token is valid and not expired
- Ensure you're writing to the correct collection names

#### "Project Not Found" Errors

- Verify your `FIREBASE_PROJECT_ID` matches exactly
- Check that the project exists and you have access

#### "Invalid API Key" Errors

- Verify your `FIREBASE_API_KEY` is correct
- Check that the API key isn't restricted to different domains

#### Rate Limiting

- Firebase has generous rate limits, but check quotas in Console → Usage
- For high-volume scenarios, consider implementing client-side caching

### Support Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security)
- [AegisPay Discord](#) _(Coming Soon)_
- [GitHub Issues](https://github.com/AegisPayments/aegis-cre/issues)

---

## 10. Next Steps

Once your Firebase setup is complete:

1. **Run Tests**: Execute the full test suite to verify everything works:

   ```bash
   cd testing && npm run test:all
   ```

2. **Simulate Workflows**: Test the CRE workflow with local simulation:

   ```bash
   cre workflow simulate ./aegis-workflow --target local-simulation
   ```

3. **Deploy to Staging**: Configure staging environment with separate Firebase project

4. **Monitor Logs**: Watch your Firestore console for real-time transaction logs

---

**Your AegisPay CRE workflow is now connected to Firebase and ready to process payments! 🚀**
