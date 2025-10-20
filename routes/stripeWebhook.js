// routes/stripeWebhook.js
const express = require('express');
const router = express.Router();
const { nanoid } = require('nanoid');
const mysql = require('mysql2/promise');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Pool MySQL (ajusta con tus variables)
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

// Webhook: requiere cuerpo RAW para verificar firma de Stripe
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET // whsec_...
    ); // Verificación de firma [web:159]

    // Procesar pago completado de Checkout
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object; // customer_email, id, etc. [web:120]

      const email = (session.customer_email || '').toLowerCase();
      // Si enviaste metadata.nombre en la sesión, recupéralo; si no, usa "Alumno"
      const nombre = (session.metadata?.nombre || 'Alumno').trim().slice(0, 120);

      // Genera código y expiración
      const code = nanoid(10);
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90); // 90 días

      // Inserta en DB (idempotencia básica por event.id)
      const sql = `INSERT INTO access_codes (email, nombre, code, expires_at, status, stripe_event_id)
                   VALUES (?, ?, ?, ?, 'active', ?)
                   ON DUPLICATE KEY UPDATE stripe_event_id = stripe_event_id`;
      await pool.execute(sql, [email, nombre, code, expiresAt, event.id]);

      // Aquí puedes agregar envío de correo con Postmark si ya tienes el token:
      // await sendAccessEmail(email, nombre, code, expiresAt);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    // Firma inválida u otro error
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

module.exports = router;
