// routes/stripeWebhook.js
const express = require('express');
const router = express.Router();
const { nanoid } = require('nanoid');
const mysql = require('mysql2/promise');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Pool MySQL (mismo origen que server.js)
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

// Webhook de Stripe: usa RAW para verificación de firma
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET); // [web:159]

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object; // [web:120]
      const email = (session.customer_email || '').toLowerCase();
      const nombre = (session.metadata?.nombre || 'Alumno').trim().slice(0, 120);
      const code = nanoid(10);
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90); // 90 días

      // Inserta registro (idempotencia: añade UNIQUE a stripe_event_id si quieres)
      const sql = `INSERT INTO access_codes (email, nombre, code, expires_at, status, stripe_event_id)
                   VALUES (?, ?, ?, ?, 'active', ?)
                   ON DUPLICATE KEY UPDATE stripe_event_id = stripe_event_id`;
      await pool.execute(sql, [email, nombre, code, expiresAt, event.id]);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

module.exports = router;
