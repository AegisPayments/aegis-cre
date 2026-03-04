export const sigGenSamples = [
  {
    name: "Large Amount Authorization",
    user: "0x9F77cBDb561aaD32b403695306e3eea53F9B40e7",
    merchant: "0x9F77cBDb561aaD32b403695306e3eea53F9B40e7", // TODO: i have used my main dev wallet as both user and merchant here for testing. If needed update the addresses or logic in contract to support admin functions.
    amount: 1000,
    nonce: 1,
  },
  {
    name: "Basic Authorization",
    user: "0x9F77cBDb561aaD32b403695306e3eea53F9B40e7", // Corresponds to the test private key
    merchant: "0x9F77cBDb561aaD32b403695306e3eea53F9B40e7", // TODO: i have used my main dev wallet as both user and merchant here for testing. If needed update the addresses or logic in contract to support admin functions.
    amount: 100,
    nonce: 2,
  },
  {
    name: "Different Merchant",
    user: "0x9F77cBDb561aaD32b403695306e3eea53F9B40e7",
    merchant: "0x1111111111111111111111111111111111111111",
    amount: 50,
    nonce: 3,
  },
];
