// server.js
// Express + CORS + estáticos + Stripe Checkout con hardening para Render

const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();

/* ===== 1) Seguridad y CORS ===== */
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://productos-ec0301-1-0-dwk2.onrender.com' // Ajusta a tu frontend
];

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // healthchecks/curl
    return allowedOrigins.includes(origin)
      ? cb(null, true)
      : cb(new Error('Origin no permitido por CORS'));
  },
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Preflight

// Headers básicos de seguridad (sin helmet para mantenerlo simple)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

/* ===== 2) Body parser ===== */
app.use(express.json());

/* ===== 3) Estáticos y ruta raíz ===== */
app.use(express.static(path.join(__dirname, 'public'))); // /css, /js, etc.
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ===== 4) Health y Config para diagnóstico ===== */
app.get('/health', (_req, res) => res.status(200).send('ok'));
app.get('/config', (req, res) => {
  // Exponer SOLO información no sensible para validar conectividad desde el navegador
  res.status(200).json({
    env: process.env.NODE_ENV || 'development',
    frontendOrigins: allowedOrigins,
    hasStripeKey: !!process.env.STRIPE_SECRET_KEY
  });
});

/* ===== 5) Utilidades de validación ===== */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').toLowerCase());
}
function sanitizeText(s) {
  return String(s || '').trim().replace(/\s+/g, ' ').slice(0, 120);
}

/* ===== 6) Endpoint de Stripe Checkout ===== */
app.post('/create-checkout-session', async (req, res) => {
  // 6.1) Comprobación temprana de la clave
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ message: 'Stripe no está configurado (STRIPE_SECRET_KEY ausente).' });
  }

  // 6.2) Carga de Stripe con manejo de errores
  let stripe;
  try {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  } catch (e) {
    return res.status(500).json({ message: 'No se pudo cargar Stripe: ' + e.message });
  }

  // 6.3) Validar payload
  const nombre = sanitizeText(req.body?.nombre);
  const email = String(req.body?.email || '').toLowerCase();

  if (!nombre || !isValidEmail(email)) {
    return res.status(400).json({ message: 'Datos inválidos: nombre o email.' });
  }

  // 6.4) Crear sesión de Checkout
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'oxxo'],
      payment_method_options: { oxxo: { expires_after_days: 2 } },
      customer_email: email,
      // Importes en centavos (997 MXN = 99700)
      line_items: [
        {
          price_data: {
            currency: 'mxn',
            unit_amount: 99700,
            product_data: {
              name: 'Acceso EC0301 (3 meses)',
              description: `Alumno: ${nombre}`
            }
          },
          quantity: 1
        }
      ],
      success_url: 'https://productos-ec0301-1-0-dwk2.onrender.com/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://productos-ec0301-1-0-dwk2.onrender.com/cancel.html'
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    // Propaga el mensaje real de Stripe para depuración del frontend
    return res.status(500).json({ message: err.message });
  }
});

/* ===== 7) Puesto para Render ===== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en ${PORT}`));
