const qs = require("querystring");

function providerConfigured() {
  return !!(process.env.UPSTREAM_API_URL && process.env.UPSTREAM_API_KEY);
}

async function callProvider(params) {
  if (!providerConfigured()) {
    throw new Error("Upstream provider is not configured. Set UPSTREAM_API_URL and UPSTREAM_API_KEY.");
  }

  const body = new URLSearchParams({
    key: process.env.UPSTREAM_API_KEY,
    ...params
  });

  const response = await fetch(process.env.UPSTREAM_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error(`Provider HTTP ${response.status}`);
  }

  const text = await response.text();
  try { return JSON.parse(text); }
  catch { throw new Error("Provider returned invalid JSON"); }
}

async function getServices() {
  return callProvider({ action: "services" });
}

async function createOrder(service, link, quantity) {
  return callProvider({
    action: "add",
    service: service.provider_service_id,
    link,
    quantity: String(quantity)
  });
}

async function getOrderStatus(providerOrderId) {
  return callProvider({ action: "status", order: String(providerOrderId) });
}

async function getBalance() {
  return callProvider({ action: "balance" });
}

module.exports = { providerConfigured, getServices, createOrder, getOrderStatus, getBalance };
