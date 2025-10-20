const express = require('express');
const path = require('path'); // Herramienta de Node.js para manejar rutas de archivos
const cors = require('cors'); // Reutilizamos CORS
const { nanoid } = require('nanoid'); // Para generar códigos y tokens
const postmark = require("postmark"); // Para enviar correos
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Para pagos

const app = express(); // Crear la aplicación Express
const PORT = process.env.PORT || 3001; // Render asigna el puerto aquí
const YOUR_DOMAIN = process.env.YOUR_DOMAIN || `http://localhost:${PORT}`;
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

const postmarkClient = new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN);
const validAccessCodes = {}; // Almacén temporal de códigos (¡usa DB en producción!)

// --- Configuración Middleware ---
app.use(cors()); // Permitir peticiones de otros orígenes (importante para APIs)

// --- Webhook de Stripe (NECESITA CUERPO RAW, va ANTES de express.json()) ---
app.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    // ... (Tu código existente del webhook va aquí SIN CAMBIOS) ...
    // Asegúrate de que toda la lógica de verificación, generación de código y envío de email esté aquí.
    // Ejemplo abreviado:
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const email = session.customer_email;
            const nombre = session.metadata?.nombre_cliente || 'Cliente';
            const code = `SKILLSCERT-${nanoid(10)}`;
            const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
            saveAccess({ email, code, expiresAt: expiresAt.toISOString() });
            await sendEmail({ /* ... datos del email ... */
                to: email,
                subject: "Tu acceso SkillsCert EC0301",
                html: `<h1>¡Hola, ${nombre}!</h1><p>Tu código es: ${code}</p><p><a href="${YOUR_DOMAIN}/login.html">Ingresar</a></p>`,
                text: `Tu código es ${code}`
            });
        }
        res.status(200).send("recibido");
    } catch (err) {
        console.error("Webhook Error:", err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
    }
});

// --- Servir Archivos Estáticos ---
// Sirve todos los archivos que están dentro de la carpeta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// --- Middleware para Parsear JSON ---
// Va DESPUÉS del webhook y DESPUÉS de servir estáticos si no afecta a las APIs
app.use(express.json());

// --- Rutas de API ---
// Tu ruta existente para crear la sesión de pago
app.post('/create-checkout-session', async (req, res) => {
    // ... (Tu código existente SIN CAMBIOS va aquí) ...
    // Ejemplo abreviado:
     try {
        const { email, nombre } = req.body;
        if (!email || !nombre) { return res.status(400).json({ message: 'Nombre y email requeridos.' }); }
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'oxxo'],
            line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
            mode: 'payment',
            success_url: `${YOUR_DOMAIN}/exito.html`, // Asegúrate que exito.html está en 'public'
            cancel_url: `${YOUR_DOMAIN}/cancelar.html`, // Asegúrate que cancelar.html está en 'public'
            customer_email: email,
            metadata: { nombre_cliente: nombre }
        });
        res.json({ url: session.url });
    } catch (error) { console.error("Error al crear sesión:", error); res.status(500).send({ error: 'No se pudo iniciar pago.' }); }
});

// Tu ruta existente para validar el código
app.post('/api/validate-code', (req, res) => {
    // ... (Tu código existente SIN CAMBIOS va aquí) ...
    // Ejemplo abreviado:
    const { accessCode } = req.body;
    if (!accessCode) return res.status(400).json({ message: 'Código no proporcionado.' });
    const codeData = validAccessCodes[accessCode];
    if (codeData) {
        const now = new Date(); const expiration = new Date(codeData.expires);
        if (now < expiration) {
            const token = `VALID_SESSION_${nanoid(20)}`;
            res.status(200).json({ message: 'Acceso concedido.', token: token });
        } else { res.status(401).json({ message: 'Código expirado.' }); }
    } else { res.status(401).json({ message: 'Código inválido.' }); }
});

// --- Ruta Catch-All para SPA (Single Page Application) ---
// Si tu frontend usa rutas del lado del cliente (React Router, Vue Router, etc.), esto es útil.
// Si no, puedes quitarla o dejarla por si acaso.
// Asegúrate de que esta ruta esté DESPUÉS de tus rutas API y DESPUÉS de servir estáticos.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Funciones Helper ---
// Tus funciones saveAccess y sendEmail (¡adaptadas para Postmark!) van aquí
function saveAccess(record) {
    console.log("💾 Guardando acceso (en memoria):", record.code);
    validAccessCodes[record.code] = { email: record.email, expires: record.expiresAt };
    // EN PRODUCCIÓN: Reemplaza con DB
}

async function sendEmail({ to, subject, text, html }) {
    console.log(`✉️ Enviando email (vía Postmark) a ${to}`);
    try {
        await postmarkClient.sendEmail({
            "From": "info@skillscert.com.mx", // Email verificado
            "To": to, "Subject": subject, "TextBody": text, "HtmlBody": html,
            "MessageStream": "outbound"
        });
        console.log(`✅ Correo enviado a ${to}`);
    } catch (error) { console.error("❌ Error enviando correo:", error.message); }
}

// --- Iniciar el Servidor ---
app.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
    console.log(`🔗 Dominio configurado: ${YOUR_DOMAIN}`);
});
