// server.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();

// 1) Montar el webhook ANTES del JSON global (usa RAW internamente)
const stripeWebhook = require('./routes/stripeWebhook');
app.use('/', stripeWebhook);

// 2) Middlewares estándar para el resto de rutas
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json());

// 3) Estáticos y raíz
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// 4) Endpoint de login con código (validación)
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

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
    if (row.status !== 'active') return res.status(400).json({ ok: false, message: `Código ${row.status}` });
    if (new Date(row.expires_at) < new Date())
      return res.status(400).json({ ok: false, message: 'Código expirado' });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// 5) Healthcheck
app.get('/health', (_req, res) => res.status(200).send('ok'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en ${PORT}`));
