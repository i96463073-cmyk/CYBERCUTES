require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const db = require("./database");
const { hashPassword, verifyPassword, signUser, requireAuth, requireAdmin } = require("./auth");
const provider = require("./provider");
const payments = require("./payments");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});
app.use("/api/", apiLimiter);

app.use(express.static(path.join(__dirname, "..", "public")));

function money(n) {
  return Math.round(Number(n) * 100) / 100;
}

app.post("/api/auth/register", (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password || password.length < 8) {
    return res.status(400).json({ error: "Name, valid email and password of at least 8 characters are required." });
  }

  try {
    const info = db.prepare(
      "INSERT INTO users (name,email,phone,password_hash) VALUES (?,?,?,?)"
    ).run(name.trim(), email.trim().toLowerCase(), phone || "", hashPassword(password));

    const user = db.prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid);
    res.json({ token: signUser(user), user: { id: user.id, name: user.name, email: user.email, balance: user.balance } });
  } catch (e) {
    res.status(400).json({ error: e.message.includes("UNIQUE") ? "Email is already registered." : "Registration failed." });
  }
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(String(email || "").toLowerCase());

  if (!user || !verifyPassword(password || "", user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  res.json({
    token: signUser(user),
    user: { id: user.id, name: user.name, email: user.email, balance: user.balance, is_admin: !!user.is_admin }
  });
});

app.get("/api/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT id,name,email,phone,balance,is_admin,created_at FROM users WHERE id=?").get(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json(user);
});

app.get("/api/services", (req, res) => {
  const rows = db.prepare(
    "SELECT id,provider_service_id,category,name,description,provider_rate,markup_percent,min_quantity,max_quantity FROM services WHERE enabled=1 ORDER BY category,name"
  ).all();
  res.json(rows.map(s => ({
    ...s,
    rate: money(s.provider_rate * (1 + s.markup_percent / 100))
  })));
});

app.post("/api/admin/sync-services", requireAuth, requireAdmin, async (req, res) => {
  try {
    const data = await provider.getServices();
    if (!Array.isArray(data)) return res.status(502).json({ error: "Provider services response was not an array." });

    const upsert = db.prepare(`
      INSERT INTO services
      (provider_service_id,category,name,description,provider_rate,min_quantity,max_quantity,updated_at)
      VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(provider_service_id) DO UPDATE SET
        category=excluded.category,
        name=excluded.name,
        description=excluded.description,
        provider_rate=excluded.provider_rate,
        min_quantity=excluded.min_quantity,
        max_quantity=excluded.max_quantity,
        updated_at=CURRENT_TIMESTAMP
    `);

    const tx = db.transaction((services) => {
      for (const s of services) {
        upsert.run(
          String(s.service),
          String(s.category || "General"),
          String(s.name || `Service ${s.service}`),
          String(s.description || ""),
          Number(s.rate || 0),
          Number(s.min || 1),
          Number(s.max || 1000)
        );
      }
    });
    tx(data);

    res.json({ message: `Synced ${data.length} services.` });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/orders", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT o.id,o.provider_order_id,o.link,o.quantity,o.charge,o.status,o.created_at,
           s.name AS service_name,s.category
    FROM orders o JOIN services s ON s.id=o.service_id
    WHERE o.user_id=? ORDER BY o.id DESC LIMIT 100
  `).all(req.user.id);
  res.json(rows);
});

app.post("/api/orders", requireAuth, async (req, res) => {
  const { serviceId, link, quantity } = req.body;
  const service = db.prepare("SELECT * FROM services WHERE id=? AND enabled=1").get(Number(serviceId));

  if (!service) return res.status(400).json({ error: "Invalid service." });
  if (!/^https?:\/\/\S+/i.test(String(link || ""))) return res.status(400).json({ error: "Enter a valid URL." });

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < service.min_quantity || qty > service.max_quantity) {
    return res.status(400).json({ error: `Quantity must be between ${service.min_quantity} and ${service.max_quantity}.` });
  }

  const charge = money((service.provider_rate * (1 + service.markup_percent / 100)) * qty / 1000);
  const user = db.prepare("SELECT balance FROM users WHERE id=?").get(req.user.id);
  if (Number(user.balance) < charge) return res.status(400).json({ error: "Insufficient balance. Please add funds." });

  try {
    const result = await provider.createOrder(service, String(link), qty);
    if (!result || !result.order) throw new Error(result?.error || "Provider did not return an order ID.");

    const create = db.transaction(() => {
      db.prepare("UPDATE users SET balance=balance-? WHERE id=?").run(charge, req.user.id);
      const info = db.prepare(`
        INSERT INTO orders (user_id,service_id,provider_order_id,link,quantity,charge,status)
        VALUES (?,?,?,?,?,?,?)
      `).run(req.user.id, service.id, String(result.order), String(link), qty, charge, "Pending");
      db.prepare(`
        INSERT INTO transactions (user_id,type,amount,reference,status)
        VALUES (?,?,?,?,?)
      `).run(req.user.id, "ORDER", -charge, `ORDER-${info.lastInsertRowid}`, "COMPLETED");
      return info.lastInsertRowid;
    });

    const orderId = create();
    res.json({ message: "Order created.", orderId, providerOrderId: String(result.order), charge });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.post("/api/orders/:id/refresh", requireAuth, async (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id=? AND user_id=?").get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: "Order not found." });

  try {
    const result = await provider.getOrderStatus(order.provider_order_id);
    const status = String(result.status || "Pending");
    db.prepare("UPDATE orders SET status=? WHERE id=?").run(status, order.id);
    res.json({ status });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.post("/api/payments/create", requireAuth, async (req, res) => {
  const amount = Number(req.body.amount);
  const email = String(req.body.email || "");
  const phone = String(req.body.phone || "");

  if (!Number.isFinite(amount) || amount < 1) return res.status(400).json({ error: "Enter a valid amount." });
  if (!email.includes("@")) return res.status(400).json({ error: "Enter a valid email." });

  const merchantReference = payments.makeMerchantReference();

  try {
    const result = await payments.createPaymentRequest({
      amount, email, phone, description: "CyberCute wallet funding"
    });

    db.prepare(`
      INSERT INTO payments (user_id,merchant_reference,amount,status,provider_reference)
      VALUES (?,?,?,?,?)
    `).run(req.user.id, merchantReference, amount, "PENDING", result.providerReference || null);

    res.json({ merchantReference, redirectUrl: result.redirectUrl });
  } catch (e) {
    res.status(501).json({ error: e.message });
  }
});

app.post("/api/payments/ipn", (req, res) => {
  // Verify the notification with PesaPal before changing any balance.
  // This route intentionally does not credit funds by itself.
  res.json({ received: true });
});

app.get("/api/admin/provider-status", requireAuth, requireAdmin, async (req, res) => {
  try {
    const balance = await provider.getBalance();
    res.json({ configured: true, provider: balance });
  } catch (e) {
    res.status(502).json({ configured: provider.providerConfigured(), error: e.message });
  }
});

app.get("/api/admin/stats", requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare("SELECT COUNT(*) c FROM users").get().c;
  const orders = db.prepare("SELECT COUNT(*) c FROM orders").get().c;
  const revenue = db.prepare("SELECT COALESCE(SUM(amount),0) a FROM transactions WHERE type='ORDER' AND amount < 0").get().a;
  const deposits = db.prepare("SELECT COALESCE(SUM(amount),0) a FROM transactions WHERE type='DEPOSIT' AND amount > 0").get().a;
  res.json({ users, orders, revenue: Math.abs(revenue), deposits });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`CyberCute running on http://localhost:${PORT}`);
});
