// ============================================================
// TEST-WEBHOOK-CONFIG.JS - Script de Diagnóstico
// ============================================================
// Ejecutar con: node test-webhook-config.js

require('dotenv').config();

console.log('\n🔍 DIAGNÓSTICO DE CONFIGURACIÓN DEL WEBHOOK\n');
console.log('='.repeat(60));

// 1. Verificar Variables de Entorno
console.log('\n1️⃣ VARIABLES DE ENTORNO');
console.log('─'.repeat(60));

const requiredVars = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'POSTMARK_SERVER_TOKEN',
  'POSTMARK_FROM_EMAIL',
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME'
];

let missingVars = [];

requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (!value) {
    console.log(`❌ ${varName}: NO CONFIGURADA`);
    missingVars.push(varName);
  } else {
    // Mostrar solo primeros y últimos caracteres por seguridad
    const masked = value.length > 10 
      ? `${value.substring(0, 8)}...${value.substring(value.length - 4)}`
      : '***';
    console.log(`✅ ${varName}: ${masked}`);
  }
});

if (missingVars.length > 0) {
  console.log(`\n⚠️  FALTAN ${missingVars.length} VARIABLES`);
  console.log('Agrégalas en Render → Environment Variables\n');
}

// 2. Verificar Conexión a Base de Datos
console.log('\n2️⃣ CONEXIÓN A BASE DE DATOS');
console.log('─'.repeat(60));

const mysql = require('mysql2/promise');

async function testDatabase() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });

    console.log('✅ Conexión exitosa');

    // Verificar tablas
    const [tables] = await connection.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME IN ('access_codes', 'email_delivery_log', 'webhook_events_log')
    `, [process.env.DB_NAME]);

    console.log('\n📋 Tablas encontradas:');
    const requiredTables = ['access_codes', 'email_delivery_log', 'webhook_events_log'];
    
    requiredTables.forEach(tableName => {
      const exists = tables.some(t => t.TABLE_NAME === tableName);
      console.log(exists ? `✅ ${tableName}` : `❌ ${tableName} (FALTA)`);
    });

    await connection.end();
  } catch (error) {
    console.log('❌ Error de conexión:', error.message);
  }
}

// 3. Verificar Postmark
console.log('\n3️⃣ POSTMARK');
console.log('─'.repeat(60));

const postmark = require('postmark');

async function testPostmark() {
  try {
    const client = new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN);
    
    // Verificar server (no envía email real)
    const server = await client.getServer();
    console.log('✅ Token válido');
    console.log(`   Server: ${server.Name}`);
    console.log(`   Emails enviados: ${server.MessagesSent}`);
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

// 4. Verificar Stripe
console.log('\n4️⃣ STRIPE');
console.log('─'.repeat(60));

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function testStripe() {
  try {
    const account = await stripe.accounts.retrieve();
    console.log('✅ API Key válida');
    console.log(`   Cuenta: ${account.id}`);
    console.log(`   Email: ${account.email || 'N/A'}`);
    
    // Verificar webhooks
    const webhooks = await stripe.webhookEndpoints.list({ limit: 5 });
    console.log(`\n📡 Webhooks configurados: ${webhooks.data.length}`);
    
    webhooks.data.forEach(wh => {
      console.log(`   • ${wh.url}`);
      console.log(`     Estado: ${wh.status}`);
      console.log(`     Eventos: ${wh.enabled_events.join(', ')}`);
    });
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

// Ejecutar todos los tests
(async () => {
  await testDatabase();
  await testPostmark();
  await testStripe();
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Diagnóstico completado\n');
  
  if (missingVars.length > 0) {
    console.log('⚠️  ACCIÓN REQUERIDA:');
    console.log(`   Configura las variables faltantes: ${missingVars.join(', ')}\n`);
  }
})();