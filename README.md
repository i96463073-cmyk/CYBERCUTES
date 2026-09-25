# CyberCute SMM Panel

A starter production-oriented SMM panel using vanilla HTML/CSS/JavaScript and a Node.js/Express backend.

## Features
- Responsive CyberCute dashboard UI
- User registration/login
- SQLite database
- Upstream SMM provider API adapter
- Service synchronization
- Order creation/status checking
- Configurable markup
- PesaPal integration scaffold
- WhatsApp support: +254796681162
- Server-side validation and protected secrets

## Install
1. Install Node.js 18+.
2. Copy `.env.example` to `.env`.
3. Add your real upstream SMM API and PesaPal credentials.
4. Run `npm install`.
5. Run `npm start`.
6. Open `http://localhost:3000`.

## PesaPal
This project includes the PesaPal OAuth/order/IPN integration structure. Confirm the current PesaPal API version, endpoints, callback/IPN URL requirements and production credentials in PesaPal's current developer documentation before going live.

The starter intentionally does not contain real credentials.

## Upstream provider
Set:
- `UPSTREAM_API_URL`
- `UPSTREAM_API_KEY`

The adapter expects the common SMM-panel API format:
- `action=services`
- `action=add`
- `action=status`
- `action=balance`

If your provider uses a different API contract, edit `server/provider.js`.

## Admin
The first registered account is not automatically an admin. For a real deployment, add an admin account through a secure provisioning process. This starter includes admin API scaffolding and stores an `is_admin` field.

## Security
- Never commit `.env`.
- Use HTTPS in production.
- Use a strong `SESSION_SECRET`.
- Configure trusted origins/CORS for your deployment.
- Review payment/IPN verification with PesaPal before production.
