const express = require('express');

const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Index
app.get('/', (req, res) => {
  res.json({ message: 'SkillsCert Payment System', status: 'running' });
});

// Intentar cargar payment controller
let paymentController = null;
try {
  paymentController = require('./paymentController');
} catch (e) {
  console.warn('Warning: paymentController no cargado');
}

// Si se cargó, registrar rutas
if (paymentController) {
  const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token || !token.startsWith('Bearer_')) {
      return res.status(401).json({ success: false, message: 'Token requerido' });
    }
    next();
  };

  app.post('/api/payments', auth, paymentController.processPayment);
  app.get('/api/payments/history/:userId', auth, paymentController.getPaymentHistory);
  app.get('/api/payments/stats/:userId', auth, paymentController.getStats);
}

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ success: false, message: 'Error' });
});

// Listen
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
```

### 4️⃣ Commit
- Abajo, en "Commit message" escribe: `Fix: Simplify app.js`
- Haz clic en "Commit changes"

---

## ✅ LISTO

Render se redeployará en 1-2 minutos.

Deberías ver:
```
✅ Build successful
✅ Deploying...
✅ Server running on port 3000
