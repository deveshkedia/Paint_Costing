require('dotenv').config({ path: '.env.local' });
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

async function createRmManagerUser() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  try {
    console.log('👤 Creating RM Manager user...\n');

    const email = 'rmmanager@anupampaints.com';
    const password = 'rmmanager123';
    const name = 'RM Manager';

    // Check if user already exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      console.log(`✓ User ${email} already exists`);
      pool.end();
      return;
    }

    // Create user
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      [name, email, hash, 'rm_manager']
    );

    console.log('✅ RM Manager user created!\n');
    console.log('Login credentials:');
    console.log(`  Email: ${email}`);
    console.log(`  Password: ${password}`);
    console.log('\n📌 This user can only:');
    console.log('  • View raw materials');
    console.log('  • Add new raw materials');
    console.log('  • Edit material names and prices');
    console.log('  • Delete/deactivate materials');
    console.log('\n❌ This user CANNOT access:');
    console.log('  • Products & Formulations');
    console.log('  • Quotes');
    console.log('  • Packing Materials');
    console.log('  • User Management');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createRmManagerUser();
