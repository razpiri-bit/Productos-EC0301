// routes/stripeWebhook.js
const express = require('express');
const router = express.Router();
const { nanoid } = require('nanoid');
const mysql = require('mysql2/promise');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Pool MySQL (ajusta credenciales con tus variables de entorno)
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

// IMPORTANTE: usar express.raw SOLO aquí para validar firma de Stripe
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  let event;
  try {
    // constructEvent exige el cuerpo crudo (Buffer) tal cual llegó
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    try {
      const session = event.data.object;
      const email = (session.customer_email || '').toLowerCase();
      const nombre = (session.metadata?.nombre || 'Alumno').slice(0,120);
      const code = nanoid(10);
      const expiresAt = new Date(Date.now() + 1000*60*60*24*90); // 90 días

      const sql = `INSERT INTO access_codes (email, nombre, code, expires_at, status, stripe_event_id)
                   VALUES (?, ?, ?, ?, 'active', ?)`;
      await pool.execute(sql, [email, nombre, code, expiresAt, event.id]);
    } catch (err) {
      // Loguea el error; Stripe reintenta si respondes !=2xx
      console.error('Error al procesar el webhook:', err.message);
    }
  }

  // Responde 200 para confirmar recepción a Stripe
  return res.status(200).json({ received: true });
});

module.exports = router;
