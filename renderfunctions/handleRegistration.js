const express = require('express');
const cors = require('cors');
const { nanoid } = require('nanoid');
const sgMail = require('@sendgrid/mail');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const YOUR_DOMAIN = process.env.YOUR_DOMAIN || 'http://localhost:3001';

app.use(express.json());
app.use(cors());
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Almacén temporal en memoria para códigos válidos (¡NO USAR EN PRODUCCIÓN REAL!)
// Guardaremos el código y la fecha de expiración (3 meses)
const validAccessCodes = {};

// --- RUTA para CREAR la sesión de pago ---
app.post('/create-checkout-session', async (req, res) => {
    // ... (código existente para crear la sesión de Stripe) ...
    // Asegúrate de que este código siga aquí
     try {
        const { email, nombre } = req.body;
        if (!email || !nombre) {
            return res.status(400).json({ message: 'El nombre y el email son requeridos.' });
        }
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'oxxo'],
            line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1, }],
            mode: 'payment',
            success_url: `${YOUR_DOMAIN}/exito.html`,
            cancel_url: `${YOUR_DOMAIN}/cancelar.html`,
            customer_email: email,
            metadata: { nombre_cliente: nombre }
        });
        res.json({ url: session.url });
    } catch (error) {
        console.error("Error al crear la sesión de checkout:", error);
        res.status(500).send({ error: error.message });
    }
});

// --- RUTA "Webhook" para ESCUCHAR la confirmación de pago ---
app.post('/stripe-webhook', express.raw({type: 'application/json'}), async (req, res) => {
    // ... (código existente para verificar el webhook) ...
     const sig = req.headers['stripe-signature'];
     let event;
     try {
         event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
     } catch (err) {
         return res.status(400).send(`Webhook Error: ${err.message}`);
     }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const nombre = session.metadata.nombre_cliente;
        const email = session.customer_email;
        const accessCode = `SKILLSCERT-${nanoid(10)}`; // Genera el código único

        // *** NUEVO: Guardar el código y calcular su expiración ***
        const expirationDate = new Date();
        expirationDate.setMonth(expirationDate.getMonth() + 3); // Añade 3 meses
        validAccessCodes[accessCode] = { email: email, expires: expirationDate.toISOString() };
        console.log(`Código ${accessCode} generado para ${email}, expira en ${expirationDate.toLocaleDateString()}`);
        // **********************************************************

        const msg = {
            to: email,
            from: 'info@skillscert.com.mx', // Email verificado
            subject: '¡Bienvenido a SkillsCert! Tu Acceso al Generador EC0301',
            html: `<h1>¡Hola, ${nombre}!</h1><p>Tu pago ha sido procesado. Aquí está tu código de acceso:</p><h2 style="background:#f1f5f9; padding:1rem; border-radius:8px;">${accessCode}</h2><p><strong>Guarda este código</strong>, lo necesitarás para acceder. Es válido por 3 meses.</p><p><a href="${YOUR_DOMAIN}/login.html">Haz clic aquí para ingresar</a></p><p>¡Gracias por confiar en SkillsCert!</p>`,
        };
        try { await sgMail.send(msg); } catch (error) { console.error("Error al enviar correo:", error); }
    }
    res.json({received: true});
});

// *** NUEVA RUTA: Validar el código de acceso ***
app.post('/api/validate-code', (req, res) => {
    const { accessCode } = req.body;

    if (!accessCode) {
        return res.status(400).json({ message: 'Código no proporcionado.' });
    }

    const codeData = validAccessCodes[accessCode];

    if (codeData) {
        // Verifica si el código ha expirado
        const now = new Date();
        const expiration = new Date(codeData.expires);
        if (now < expiration) {
            // Código válido y no expirado
            // Generamos un "token" simple (en producción usar JWT)
            const token = `VALID_SESSION_${nanoid(20)}`;
            console.log(`Código ${accessCode} validado para ${codeData.email}`);
            // Enviamos el token al frontend
            res.status(200).json({ message: 'Acceso concedido.', token: token });
        } else {
            // Código expirado
            console.log(`Código ${accessCode} expirado.`);
            delete validAccessCodes[accessCode]; // Limpiar código expirado
            res.status(401).json({ message: 'El código de acceso ha expirado.' });
        }
    } else {
        // Código no encontrado
        console.log(`Intento de acceso con código inválido: ${accessCode}`);
        res.status(401).json({ message: 'Código de acceso inválido.' });
    }
});
// *******************************************

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));
