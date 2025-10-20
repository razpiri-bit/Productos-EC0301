// --- Importar Herramientas ---
const express = require('express');
const cors = require('cors');
const { nanoid } = require('nanoid'); // Asegúrate de tener nanoid v3: npm install nanoid@3
const postmark = require("postmark"); // Importar Postmark
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const YOUR_DOMAIN = process.env.YOUR_DOMAIN || 'http://localhost:3001';
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Crear un cliente de Postmark usando la clave API del Server Token
const postmarkClient = new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN);

// --- Configuración del Servidor ---
app.use(cors());
// El webhook de Stripe necesita el cuerpo RAW. express.json() va DESPUÉS.
app.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error("⚠️ Firma de webhook inválida:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const email = session.customer_email;
            const nombre = session.metadata?.nombre_cliente || 'Cliente';
            console.log(`✅ Pago exitoso recibido para: ${email}`);

            const code = `SKILLSCERT-${nanoid(10)}`;
            const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 días

            saveAccess({ email, code, expiresAt: expiresAt.toISOString() }); // Guardar (simulado)

            // Enviar correo usando Postmark
            await sendEmail({
                to: email,
                subject: "Tu acceso SkillsCert EC0301",
                text: `Gracias por tu pago, ${nombre}. Tu código de acceso es: ${code}. Vence el ${expiresAt.toLocaleDateString()}. Ingresa en ${YOUR_DOMAIN}/login.html`,
                html: `<h1>¡Hola, ${nombre}!</h1><p>Tu pago ha sido procesado. Aquí está tu código de acceso:</p><h2 style="background:#f1f5f9; padding:1rem; border-radius:8px;">${code}</h2><p>Vence el <strong>${expiresAt.toLocaleDateString()}</strong>.</p><p><a href="${YOUR_DOMAIN}/login.html">Ingresar a la Plataforma</a></p>`,
            });
        }
        res.status(200).send("recibido");
    } catch (e) {
        console.error("❌ Error procesando evento:", e);
        res.status(200).send("ok_con_error_interno"); // Responde OK a Stripe, pero registra el error
    }
});

// --- Middleware y Otras Rutas ---
app.use(express.json()); // Parsear JSON para las rutas siguientes

// Ruta para crear sesión de Stripe (sin cambios)
app.post('/create-checkout-session', async (req, res) => {
    try {
        const { email, nombre } = req.body;
        if (!email || !nombre) { return res.status(400).json({ message: 'Nombre y email requeridos.' }); }
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'oxxo'],
            line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
            mode: 'payment',
            success_url: `${YOUR_DOMAIN}/exito.html`,
            cancel_url: `${YOUR_DOMAIN}/cancelar.html`,
            customer_email: email,
            metadata: { nombre_cliente: nombre }
        });
        res.json({ url: session.url });
    } catch (error) { console.error("❌ Error al crear sesión:", error); res.status(500).send({ error: 'No se pudo iniciar pago.' }); }
});

// Ruta para validar código (sin cambios)
app.post('/api/validate-code', (req, res) => {
    const { accessCode } = req.body;
    if (!accessCode) return res.status(400).json({ message: 'Código no proporcionado.' });
    const codeData = validAccessCodes[accessCode]; // Busca en el almacén temporal
    if (codeData) {
        const now = new Date(); const expiration = new Date(codeData.expires);
        if (now < expiration) {
            const token = `VALID_SESSION_${nanoid(20)}`; // Genera token simple
            console.log(`✅ Código ${accessCode} validado para ${codeData.email}`);
            res.status(200).json({ message: 'Acceso concedido.', token: token });
        } else { res.status(401).json({ message: 'El código ha expirado.' }); }
    } else { res.status(401).json({ message: 'Código inválido.' }); }
});

// --- Funciones Helper ---
const validAccessCodes = {}; // Almacén temporal (¡usa DB en producción!)

function saveAccess(record) {
    console.log("💾 Guardando acceso (en memoria):", record.code, "para", record.email);
    validAccessCodes[record.code] = { email: record.email, expires: record.expiresAt };
    // EN PRODUCCIÓN: Reemplaza esto con tu base de datos real
}

// Función sendEmail adaptada para Postmark
async function sendEmail({ to, subject, text, html }) {
    console.log(`✉️ Enviando email (vía Postmark) a ${to} - Asunto: ${subject}`);
    try {
        // Usa el cliente de Postmark para enviar
        await postmarkClient.sendEmail({
            "From": "info@skillscert.com.mx", // Tu email verificado en Postmark
            "To": to,
            "Subject": subject,
            "TextBody": text, // Versión texto plano
            "HtmlBody": html, // Versión HTML
            "MessageStream": "outbound" // Stream transaccional por defecto en Postmark
        });
        console.log(`✅ Correo enviado exitosamente a ${to} vía Postmark.`);
    } catch (error) {
        // Captura errores específicos de Postmark si es posible
        console.error("❌ Error al enviar correo con Postmark:", error.message || error);
    }
}

// --- Iniciar el Servidor ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
    console.log(`🔗 Dominio configurado para redirecciones: ${YOUR_DOMAIN}`);
});