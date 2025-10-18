// --- Importar las herramientas necesarias ---
const express = require('express');
const cors = require('cors'); // Para permitir la comunicación entre frontend y backend
const { nanoid } = require('nanoid'); // Para generar códigos de acceso únicos
const sgMail = require('@sendgrid/mail'); // Para enviar correos electrónicos
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Para procesar pagos, usa la clave secreta de las variables de entorno

const app = express(); // Crear la aplicación del servidor
// Obtener la URL base del sitio desde las variables de entorno (o usar localhost para pruebas)
const YOUR_DOMAIN = process.env.YOUR_DOMAIN || 'http://localhost:3001';

// --- Configuración del Servidor ---
app.use(express.json()); // Permitir que el servidor entienda datos en formato JSON enviados desde el frontend
app.use(cors()); // Habilitar Cross-Origin Resource Sharing (CORS) para que el navegador permita la comunicación
sgMail.setApiKey(process.env.SENDGRID_API_KEY); // Configurar SendGrid con la clave API de las variables de entorno

// --- Almacén Temporal de Códigos ---
// ¡Importante! En una aplicación real, esto debería ser una base de datos (como PostgreSQL, MongoDB, etc.)
// Aquí guardaremos los códigos válidos y su fecha de expiración.
const validAccessCodes = {}; // Ejemplo: { "SKILLSCERT-Xyz123": { email: "user@example.com", expires: "2026-01-17T..." } }

// --- RUTA 1: Crear la Sesión de Pago de Stripe ---
// Esta ruta se activa cuando el usuario hace clic en el botón "Pagar" en index.html
app.post('/create-checkout-session', async (req, res) => {
    try {
        // Obtener el email y nombre del cuerpo de la solicitud
        const { email, nombre } = req.body;
        // Validación básica: asegurarse de que se enviaron email y nombre
        if (!email || !nombre) {
            return res.status(400).json({ message: 'El nombre y el email son requeridos.' });
        }

        // Crear la sesión de pago en Stripe
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'oxxo'], // Métodos de pago aceptados
            line_items: [
                {
                    // ID del precio del producto creado en el Dashboard de Stripe
                    price: process.env.STRIPE_PRICE_ID,
                    quantity: 1, // Comprar una unidad (un acceso)
                },
            ],
            mode: 'payment', // Modo de pago único (no suscripción)
            // URLs a las que Stripe redirigirá al usuario después del intento de pago
            success_url: `${YOUR_DOMAIN}/exito.html`, // Página si el pago es exitoso
            cancel_url: `${YOUR_DOMAIN}/cancelar.html`, // Página si el usuario cancela
            customer_email: email, // Rellenar automáticamente el email en la página de pago
            metadata: { // Información adicional que queremos guardar y recuperar después
                nombre_cliente: nombre
            }
        });

        // Enviar la URL de la página de pago de Stripe de vuelta al frontend
        res.json({ url: session.url });

    } catch (error) {
        console.error("Error al crear la sesión de checkout:", error);
        // Enviar un error genérico al frontend si algo falla
        res.status(500).send({ error: 'No se pudo iniciar el proceso de pago. Intente de nuevo.' });
    }
});

// --- RUTA 2: Webhook de Stripe ---
// Stripe envía notificaciones automáticas a esta ruta cuando ocurren eventos (ej: pago completado)
// Se usa express.raw para recibir el cuerpo de la solicitud sin procesar, necesario para la verificación
app.post('/stripe-webhook', express.raw({type: 'application/json'}), async (req, res) => {
    // Obtener la firma de la cabecera enviada por Stripe
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        // Verificar que la notificación es auténtica y viene de Stripe usando el secreto del webhook
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        // Si la firma no es válida, rechazar la solicitud
        console.log(`⚠️  Error en la firma del webhook: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Manejar el evento específico
    // Nos interesa el evento 'checkout.session.completed', que indica un pago exitoso
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object; // Obtener los datos de la sesión de pago
        console.log('✅ Pago exitoso recibido para:', session.customer_email);

        // Recuperar la información guardada en metadata
        const nombre = session.metadata.nombre_cliente;
        const email = session.customer_email;

        // Generar un código de acceso único
        const accessCode = `SKILLSCERT-${nanoid(10)}`;

        // Calcular la fecha de expiración (3 meses a partir de ahora)
        const expirationDate = new Date();
        expirationDate.setMonth(expirationDate.getMonth() + 3);

        // Guardar el código en nuestro almacén temporal (en producción, sería en la base de datos)
        validAccessCodes[accessCode] = {
            email: email,
            expires: expirationDate.toISOString() // Guardar en formato estándar ISO
        };
        console.log(`Código ${accessCode} generado para ${email}, expira el ${expirationDate.toLocaleDateString()}`);

        // Preparar el correo electrónico de bienvenida con el código
        const msg = {
            to: email, // Destinatario
            from: 'info@skillscert.com.mx', // Remitente (debe estar verificado en SendGrid)
            subject: '¡Bienvenido a SkillsCert! Tu Acceso al Generador EC0301',
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                    <h1 style="color: #1E3A8A;">¡Hola, ${nombre}!</h1>
                    <p>Tu pago ha sido procesado exitosamente. ¡Gracias por tu confianza!</p>
                    <p>Aquí está tu <strong>código de acceso personal</strong>:</p>
                    <div style="background:#f1f5f9; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
                        <h2 style="color: #FF6B35; margin: 0; font-size: 1.5em; letter-spacing: 2px;">${accessCode}</h2>
                    </div>
                    <p><strong>Guarda este código en un lugar seguro</strong>, lo necesitarás cada vez que quieras ingresar a la plataforma.</p>
                    <p>Tu acceso es válido por <strong>3 meses</strong> a partir de hoy.</p>
                    <p style="margin-top: 30px;">
                        <a href="${YOUR_DOMAIN}/login.html" style="background-color: #1E3A8A; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                            Ingresar a la Plataforma Ahora
                        </a>
                    </p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                    <p style="font-size: 0.9em; color: #6B7280;">Si tienes alguna pregunta, no dudes en contactarnos.</p>
                </div>
            `,
        };

        // Enviar el correo usando SendGrid
        try {
            await sgMail.send(msg);
            console.log(`Correo de bienvenida con código enviado exitosamente a ${email}`);
        } catch (error) {
            console.error("Error al enviar el correo:", error.response ? error.response.body : error);
        }
    } else {
        // Manejar otros eventos si fuera necesario
        console.log(`Evento de Stripe no manejado: ${event.type}`);
    }

    // Responder a Stripe para confirmar que recibimos el evento
    res.json({received: true});
});

// --- RUTA 3: Validar el Código de Acceso ---
// Se activa cuando el usuario ingresa un código en login.html
app.post('/api/validate-code', (req, res) => {
    const { accessCode } = req.body; // Obtener el código enviado desde login.html

    if (!accessCode) {
        return res.status(400).json({ message: 'Código no proporcionado.' });
    }

    // Buscar el código en nuestro almacén temporal
    const codeData = validAccessCodes[accessCode];

    if (codeData) {
        // Si el código existe, verificar si ha expirado
        const now = new Date();
        const expiration = new Date(codeData.expires);

        if (now < expiration) {
            // El código es válido y no ha expirado
            // Generamos un "token" simple para la sesión del navegador
            // En una aplicación real, se usaría JWT (JSON Web Tokens) para mayor seguridad
            const token = `VALID_SESSION_${nanoid(20)}`; // Ejemplo: VALID_SESSION_abc123xyz...
            console.log(`Código ${accessCode} validado correctamente para ${codeData.email}`);

            // Enviamos el token al frontend (login.html)
            res.status(200).json({ message: 'Acceso concedido.', token: token });
        } else {
            // El código existe pero ya expiró
            console.log(`Código ${accessCode} para ${codeData.email} ha expirado.`);
            // Opcional: Eliminar el código expirado del almacén
            // delete validAccessCodes[accessCode];
            res.status(401).json({ message: 'El código de acceso ha expirado. Por favor, regístrate de nuevo.' });
        }
    } else {
        // El código no se encontró en nuestro almacén
        console.log(`Intento de acceso fallido con código inválido: ${accessCode}`);
        res.status(401).json({ message: 'Código de acceso inválido.' });
    }
});

// --- Iniciar el Servidor ---
// Render asignará un puerto automáticamente a través de process.env.PORT
// Si se ejecuta localmente, usará el puerto 3001
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor iniciado y escuchando en el puerto ${PORT}`);
  console.log(`La URL del dominio configurada es: ${YOUR_DOMAIN}`); // Para depuración
});
