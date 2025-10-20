// server.js
// Express + CORS + Helmet + estáticos + Stripe Checkout + Login/Validación + Webhook montado correctamente

require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mysql = require('mysql2/promise');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // para /create-checkout-session

const app = express();

/* ========== 1) Webhook de Stripe (RAW) ========== */
// Monta el router del webhook ANTES del JSON global.
// Crea el archivo routes/stripeWebhook.js como se indica más abajo.
const stripeWebhook = require('./routes/stripeWebhook');
app.use('/', stripeWebhook); // expone POST /stripe/webhook con express.raw adentro [web:159][web:327]

/* ========== 2) Middlewares globales (rutas normales) ========== */
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json()); // seguro aplicar después del webhook

/* ========== 3) Estáticos y raíz ========== */
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* ========== 4) Pool MySQL para rutas normales ========== */
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

/* ========== 5) Crear sesión de Checkout (botón de pago) ========== */
// Ajusta success_url y cancel_url a tu dominio público.
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { nombre, email } = req.body || {};
    if (!nombre || !email) return res.status(400).json({ message: 'Datos inválidos' });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'oxxo'],
      payment_method_options: { oxxo: { expires_after_days: 2 } },
      customer_email: email.toLowerCase(),
      metadata: { nombre },
      line_items: [{
        price_data: {
          currency: 'mxn',
          unit_amount: 99700,
          product_data: { name: 'Acceso EC0301 (3 meses)', description: `Alumno: ${nombre}` }
        },
        quantity: 1
      }],
      success_url: 'https://productos-ec0301-1-0-dwk2.onrender.com/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://productos-ec0301-1-0-dwk2.onrender.com/cancel.html'
    }); // [web:317][web:170]

    return res.status(200).json({ url: session.url });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

/* ========== 6) Validar código para abrir la app ========== */
app.post('/login-validar', async (req, res) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) return res.status(400).json({ ok: false, message: 'Datos requeridos' });

    const sql = `SELECT email, status, expires_at FROM access_codes WHERE code = ? LIMIT 1`;
    const [rows] = await pool.execute(sql, [code]);
    const row = rows && rows[0];

    if (!row) return res.status(400).json({ ok: false, message: 'Código inválido' });
    if (row.email.toLowerCase() !== email.toLowerCase())
      return res.status(400).json({ ok: false, message: 'No corresponde al correo' });
    if (row.status !== 'active')
      return res.status(400).json({ ok: false, message: `Código ${row.status}` });
    if (new Date(row.expires_at) < new Date())
      return res.status(400).json({ ok: false, message: 'Código expirado' });

    // Aquí puedes emitir cookie/JWT si lo necesitas. Por ahora, OK simple:
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

/* ========== 7) Healthcheck ========== */
app.get('/health', (_req, res) => res.status(200).send('ok'));

/* ========== 8) Arranque ========== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en ${PORT}`));
