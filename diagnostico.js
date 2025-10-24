// ============================================
// SCRIPT DE DIAGNÓSTICO AUTOMÁTICO
// SkillsCert EC0301 - Verificar Configuración
// ============================================
//
// INSTRUCCIONES:
// 1. Crea un archivo: diagnostico.js
// 2. Pega este código
// 3. Crea un archivo .env con tus variables
// 4. Ejecuta: node diagnostico.js
//
// ============================================

require('dotenv').config();
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const axios = require('axios');
const Stripe = require('stripe');

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

function log(color, emoji, message) {
  console.log(`${color}${emoji} ${message}${colors.reset}`);
}

// ============================================
// FUNCIONES DE DIAGNÓSTICO
// ============================================

async function verificarVariablesEntorno() {
  log(colors.blue, '🔍', 'Verificando variables de entorno...\n');

  const variables = {
    'STRIPE_SECRET_KEY': process.env.STRIPE_SECRET_KEY,
    'STRIPE_WEBHOOK_SECRET': process.env.STRIPE_WEBHOOK_SECRET,
    'DB_HOST': process.env.DB_HOST,
    'DB_USER': process.env.DB_USER,
    'DB_PASSWORD': process.env.DB_PASSWORD,
    'DB_NAME': process.env.DB_NAME,
    'EMAIL_USER': process.env.EMAIL_USER,
    'EMAIL_PASSWORD': process.env.EMAIL_PASSWORD,
    'WHATSAPP_TOKEN': process.env.WHATSAPP_TOKEN,
    'WHATSAPP_PHONE_ID': process.env.WHATSAPP_PHONE_ID
  };

  let todasConfiguradas = true;

  for (const [key, value] of Object.entries(variables)) {
    if (value && value.length > 0) {
      const preview = value.substring(0, 10) + '...';
      log(colors.green, '✅', `${key}: ${preview}`);
    } else {
      log(colors.red, '❌', `${key}: NO CONFIGURADA`);
      todasConfiguradas = false;
    }
  }

  console.log('');
  return todasConfiguradas;
}

async function verificarStripe() {
  log(colors.blue, '💳', 'Verificando conexión con Stripe...\n');

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      log(colors.red, '❌', 'STRIPE_SECRET_KEY no configurada');
      return false;
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    
    // Intentar listar los últimos 3 pagos
    const charges = await stripe.charges.list({ limit: 3 });
    
    log(colors.green, '✅', 'Conexión exitosa con Stripe');
    log(colors.green, '📊', `Encontrados ${charges.data.length} pagos recientes`);

    if (charges.data.length > 0) {
      log(colors.green, '💰', `Último pago: ${charges.data[0].amount / 100} ${charges.data[0].currency.toUpperCase()}`);
    }

    // Verificar webhook secret
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      if (process.env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) {
        log(colors.green, '✅', 'STRIPE_WEBHOOK_SECRET tiene formato correcto');
      } else {
        log(colors.yellow, '⚠️', 'STRIPE_WEBHOOK_SECRET no tiene el formato esperado (whsec_xxx)');
      }
    } else {
      log(colors.red, '❌', 'STRIPE_WEBHOOK_SECRET no configurado');
    }

    console.log('');
    return true;

  } catch (error) {
    log(colors.red, '❌', `Error conectando con Stripe: ${error.message}`);
    console.log('');
    return false;
  }
}

async function verificarMySQL() {
  log(colors.blue, '🗄️', 'Verificando conexión con MySQL...\n');

  try {
    if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD) {
      log(colors.red, '❌', 'Faltan credenciales de MySQL');
      return false;
    }

    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });

    log(colors.green, '✅', 'Conexión exitosa con MySQL');

    // Verificar si existe la tabla access_codes
    const [tables] = await connection.execute(
      "SHOW TABLES LIKE 'access_codes'"
    );

    if (tables.length > 0) {
      log(colors.green, '✅', 'Tabla access_codes existe');

      // Contar registros
      const [count] = await connection.execute(
        "SELECT COUNT(*) as total FROM access_codes"
      );
      log(colors.green, '📊', `Códigos en BD: ${count[0].total}`);

      // Mostrar estructura de la tabla
      const [columns] = await connection.execute(
        "DESCRIBE access_codes"
      );
      log(colors.green, '📋', `Columnas en la tabla: ${columns.length}`);

    } else {
      log(colors.red, '❌', 'Tabla access_codes NO existe');
      log(colors.yellow, '💡', 'Debes ejecutar el script crear_tabla_mysql.sql');
    }

    await connection.end();
    console.log('');
    return true;

  } catch (error) {
    log(colors.red, '❌', `Error conectando con MySQL: ${error.message}`);
    console.log('');
    return false;
  }
}

async function verificarEmail() {
  log(colors.blue, '📧', 'Verificando configuración de Email (Gmail)...\n');

  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      log(colors.red, '❌', 'Faltan credenciales de Gmail');
      return false;
    }

    log(colors.green, '✅', `EMAIL_USER: ${process.env.EMAIL_USER}`);

    // Verificar longitud de la contraseña
    const passwordLength = process.env.EMAIL_PASSWORD.length;
    if (passwordLength === 16) {
      log(colors.green, '✅', 'EMAIL_PASSWORD tiene 16 caracteres (correcto para App Password)');
    } else {
      log(colors.yellow, '⚠️', `EMAIL_PASSWORD tiene ${passwordLength} caracteres (debería tener 16)`);
      log(colors.yellow, '💡', 'Asegúrate de usar una App Password de Gmail, no tu contraseña normal');
    }

    // Intentar crear un transporter (no envía email, solo verifica credenciales)
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    // Verificar la conexión
    await transporter.verify();
    log(colors.green, '✅', 'Conexión exitosa con Gmail');

    console.log('');
    return true;

  } catch (error) {
    log(colors.red, '❌', `Error con Gmail: ${error.message}`);
    
    if (error.message.includes('Invalid login')) {
      log(colors.yellow, '💡', 'Verifica que estés usando una App Password de Gmail');
      log(colors.yellow, '💡', 'Guía: https://myaccount.google.com/apppasswords');
    }
    
    console.log('');
    return false;
  }
}

async function verificarWhatsApp() {
  log(colors.blue, '📱', 'Verificando configuración de WhatsApp...\n');

  try {
    if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) {
      log(colors.red, '❌', 'Faltan credenciales de WhatsApp');
      return false;
    }

    const tokenLength = process.env.WHATSAPP_TOKEN.length;
    log(colors.green, '✅', `WHATSAPP_TOKEN: ${process.env.WHATSAPP_TOKEN.substring(0, 10)}... (${tokenLength} chars)`);
    log(colors.green, '✅', `WHATSAPP_PHONE_ID: ${process.env.WHATSAPP_PHONE_ID}`);

    // Intentar obtener información del número de teléfono
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`
        }
      }
    );

    log(colors.green, '✅', 'Conexión exitosa con WhatsApp Cloud API');
    log(colors.green, '📞', `Número verificado: ${response.data.display_phone_number}`);

    console.log('');
    return true;

  } catch (error) {
    log(colors.red, '❌', `Error con WhatsApp: ${error.response?.data?.error?.message || error.message}`);
    
    if (error.response?.status === 401) {
      log(colors.yellow, '💡', 'El token de WhatsApp es inválido o ha expirado');
      log(colors.yellow, '💡', 'Genera un nuevo token en: https://developers.facebook.com');
    }
    
    console.log('');
    return false;
  }
}

// ============================================
// FUNCIÓN PRINCIPAL
// ============================================

async function diagnosticar() {
  console.log('\n');
  log(colors.magenta, '🔬', '='.repeat(60));
  log(colors.magenta, '🔬', 'DIAGNÓSTICO AUTOMÁTICO - SkillsCert EC0301');
  log(colors.magenta, '🔬', '='.repeat(60));
  console.log('\n');

  const resultados = {
    variables: false,
    stripe: false,
    mysql: false,
    email: false,
    whatsapp: false
  };

  // 1. Variables de entorno
  resultados.variables = await verificarVariablesEntorno();

  // 2. Stripe
  if (process.env.STRIPE_SECRET_KEY) {
    resultados.stripe = await verificarStripe();
  } else {
    log(colors.red, '⏭️', 'Saltando verificación de Stripe (no configurado)\n');
  }

  // 3. MySQL
  if (process.env.DB_HOST) {
    resultados.mysql = await verificarMySQL();
  } else {
    log(colors.red, '⏭️', 'Saltando verificación de MySQL (no configurado)\n');
  }

  // 4. Email
  if (process.env.EMAIL_USER) {
    resultados.email = await verificarEmail();
  } else {
    log(colors.red, '⏭️', 'Saltando verificación de Email (no configurado)\n');
  }

  // 5. WhatsApp
  if (process.env.WHATSAPP_TOKEN) {
    resultados.whatsapp = await verificarWhatsApp();
  } else {
    log(colors.red, '⏭️', 'Saltando verificación de WhatsApp (no configurado)\n');
  }

  // Resumen
  console.log('\n');
  log(colors.magenta, '📊', '='.repeat(60));
  log(colors.magenta, '📊', 'RESUMEN DEL DIAGNÓSTICO');
  log(colors.magenta, '📊', '='.repeat(60));
  console.log('\n');

  const items = [
    { nombre: 'Variables de entorno', resultado: resultados.variables },
    { nombre: 'Stripe', resultado: resultados.stripe },
    { nombre: 'MySQL', resultado: resultados.mysql },
    { nombre: 'Email (Gmail)', resultado: resultados.email },
    { nombre: 'WhatsApp Cloud API', resultado: resultados.whatsapp }
  ];

  items.forEach(item => {
    if (item.resultado) {
      log(colors.green, '✅', item.nombre);
    } else {
      log(colors.red, '❌', item.nombre);
    }
  });

  const exitosos = Object.values(resultados).filter(r => r).length;
  const total = Object.keys(resultados).length;

  console.log('\n');
  log(colors.magenta, '🎯', `Resultado: ${exitosos}/${total} verificaciones exitosas`);

  if (exitosos === total) {
    log(colors.green, '🎉', '¡TODO ESTÁ CONFIGURADO CORRECTAMENTE!');
    log(colors.green, '🚀', 'Tu sistema debería funcionar sin problemas');
  } else {
    log(colors.yellow, '⚠️', 'Hay problemas de configuración');
    log(colors.yellow, '📚', 'Consulta la documentación para resolverlos');
  }

  console.log('\n');
  log(colors.magenta, '📚', 'Documentación disponible:');
  log(colors.blue, '📄', 'DIAGNOSTICO_Y_SOLUCION.md - Guía completa');
  log(colors.blue, '📄', 'SOLUCION_RAPIDA.md - Solución en 5 pasos');
  log(colors.blue, '📄', 'GUIA_CREDENCIALES.md - Cómo obtener credenciales');
  log(colors.blue, '📄', 'CHECKLIST_IMPLEMENTACION.md - Lista de verificación');
  console.log('\n');
}

// Ejecutar diagnóstico
diagnosticar().catch(error => {
  log(colors.red, '💥', `Error inesperado: ${error.message}`);
  console.error(error);
  process.exit(1);
});
