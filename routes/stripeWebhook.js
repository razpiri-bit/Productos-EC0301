// routes/stripeWebhook.js
const express = require('express');
const router = express.Router();
const { nanoid } = require('nanoid');
const mysql = require('mysql2/promise');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const postmark = require('postmark');

const pm = process.env.POSTMARK_SERVER_TOKEN
  ? new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN)
  : null;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

async function enviarCorreoCodigo(email, nombre, code, expiresAt){
  if(!pm) return; // si no hay token, omite envío
  const fecha = new Date(expiresAt).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
  const base = process.env.APP_BASE_URL || 'https://productos-ec0301-1-0-dwk2.onrender.com';
  const htmlBody = `
    <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif">
      <h2>Tu acceso a SkillsCert</h2>
      <p>Hola ${nombre},</p>
      <p>Gracias por tu compra. Este es tu <strong>código de acceso</strong>:</p>
      <p style="font-size:20px;font-weight:700;letter-spacing:1px">${code}</p>
      <p>Vigencia hasta: <strong>${fecha}</strong></p>
      <p>Puedes entrar aquí: <a href="${base}/success.html">Abrir app</a></p>
      <hr />
      <p style="color:#666">Si no reconoces este correo, ignóralo.</p>
    </div>
  `;
  await pm.sendEmail({
    From: process.env.POSTMARK_FROM_EMAIL,
    To: email,
    Subject: 'Tu código de acceso a SkillsCert',
    HtmlBody: htmlBody,
    MessageStream: 'outbound'
  });
}

// Webhook con cuerpo RAW para verificar firma
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

      const sql = `INSERT INTO access_codes (email, nombre, code, expires_at, status, stripe_event_id)
                   VALUES (?, ?, ?, ?, 'active', ?)
                   ON DUPLICATE KEY UPDATE stripe_event_id = stripe_event_id`;
      await pool.execute(sql, [email, nombre, code, expiresAt, event.id]);

      // Enviar correo (si está configurado Postmark)
      await enviarCorreoCodigo(email, nombre, code, expiresAt);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

module.exports = router;
