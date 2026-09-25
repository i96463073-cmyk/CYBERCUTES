/*
  PesaPal integration scaffold.

  PesaPal API details can change. Before production, verify the current
  PesaPal API documentation and configure the exact callback/IPN URL,
  token endpoint, order endpoint and verification flow for your account.

  Credentials are read ONLY from environment variables.
*/
const crypto = require("crypto");

function pesapalConfigured() {
  return !!(
    process.env.PESAPAL_CONSUMER_KEY &&
    process.env.PESAPAL_CONSUMER_SECRET
  );
}

function makeMerchantReference() {
  return "CC-" + crypto.randomBytes(8).toString("hex").toUpperCase();
}

async function createPaymentRequest({ amount, email, phone, description }) {
  if (!pesapalConfigured()) {
    throw new Error("PesaPal is not configured. Add PesaPal credentials to .env.");
  }

  // Keep this function isolated so the current PesaPal API endpoints/payload
  // can be updated without changing the rest of the application.
  throw new Error(
    "PesaPal credentials are present, but the current PesaPal API endpoint configuration must be completed in server/payments.js before production."
  );
}

module.exports = { pesapalConfigured, makeMerchantReference, createPaymentRequest };
