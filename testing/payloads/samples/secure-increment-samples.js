export const secureIncrementSamples = [
  {
    name: "EV Charger Basic",
    payload: {
      authorizationLogId: "1772076522483_62266", // TODO: This is a fake authoirzationLogId. need to fetch real ones associcted with currentAuth and set it
      functionName: "secureIncrement",
      merchantType: "EV_CHARGER",
      user: "0x9F77cBDb561aaD32b403695306e3eea53F9B40e7",
      merchant: "0x9F77cBDb561aaD32b403695306e3eea53F9B40e7", // TODO: i have used my main dev wallet as both user and merchant here for testing. If needed update the addresses or logic in contract to support admin functions.
      currentAuth: 50,
      requestedTotal: 75,
      reason: "Additional charging time needed",
    },
  },
  {
    name: "Retail Purchase",
    payload: {
      authorizationLogId: "1772076522483_62266", // TODO: This is a fake authoirzationLogId. need to fetch real ones associcted with currentAuth and set it
      functionName: "secureIncrement",
      merchantType: "RETAIL",
      user: "0x9F77cBDb561aaD32b403695306e3eea53F9B40e7",
      merchant: "0x9F77cBDb561aaD32b403695306e3eea53F9B40e7", // TODO: i have used my main dev wallet as both user and merchant here for testing. If needed update the addresses or logic in contract to support admin functions.
      currentAuth: 25,
      requestedTotal: 40,
      reason: "Added items to cart",
    },
  },
  {
    name: "Ride Share Extended",
    payload: {
      authorizationLogId: "1772076522483_62266", // TODO: This is a fake authoirzationLogId. need to fetch real ones associcted with currentAuth and set it
      functionName: "secureIncrement",
      merchantType: "RIDE_SHARE",
      user: "0x9F77cBDb561aaD32b403695306e3eea53F9B40e7",
      merchant: "0x9F77cBDb561aaD32b403695306e3eea53F9B40e7", // TODO: i have used my main dev wallet as both user and merchant here for testing. If needed update the addresses or logic in contract to support admin functions.
      currentAuth: 15,
      requestedTotal: 35,
      reason: "Extended trip due to traffic",
    },
  },
];
