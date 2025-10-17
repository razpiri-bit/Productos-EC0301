// --- Importar las herramientas que necesitamos ---
const express = require('express');
const cors = require('cors');
const { nanoid } = require('nanoid');
const sgMail = require('@sendgrid/mail');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const YOUR_DOMAIN = process.env.YOUR_DOMAIN || 'http://localhost:3001';

// --- Configuración ---
app.use(express.json());
app.use(cors());
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// --- RUTA para CREAR la sesión de pago ---
app.post('/create-checkout-session', async (req, res) => {
    try {
        const { email, nombre } = req.body;
        if (!email || !nombre) {
            return res.status(400).json({ message: 'El nombre y el email son requeridos.' });
        }

        const session = await stripe.checkout.sessions.create({
            // ESTA ES LA LÍNEA MODIFICADA:
            payment_method_types: ['card', 'oxxo'], // Habilita Tarjeta y OXXO
            line_items: [
                {
                    price: process.env.STRIPE_PRICE_ID,
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${YOUR_DOMAIN}/exito.html`,
            cancel_url: `${YOUR_DOMAIN}/cancelar.html`,
            customer_email: email,
            metadata: {
                nombre_cliente: nombre
            }
        });

        res.json({ url: session.url });

    } catch (error) {
        console.error("Error al crear la sesión de checkout:", error);
        res.status(500).send({ error: error.message });
    }
});

// --- RUTA "Webhook" para ESCUCHAR la confirmación de pago ---
app.post('/stripe-webhook', express.raw({type: 'application/json'}), async (req, res) => {
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
        const accessCode = `SKILLSCERT-${nanoid(10)}`;

        const msg = {
            to: email,
            from: 'info@skillscert.com.mx', // Email verificado en SendGrid
            subject: '¡Bienvenido a SkillsCert! Tu Acceso al Generador EC0301',
            html: `<h1>¡Hola, ${nombre}!</h1><p>Tu pago ha sido procesado. Aquí está tu código de acceso:</p><h2 style="background:#f1f5f9; padding:1rem; border-radius:8px;">${accessCode}</h2><p>¡Gracias por confiar en SkillsCert!</p>`,
        };

        try {
            await sgMail.send(msg);
            console.log(`Correo de bienvenida enviado a ${email}`);
        } catch (error) {
            console.error("Error al enviar el correo:", error);
        }
    }

    res.json({received: true});
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));