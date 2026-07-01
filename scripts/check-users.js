require('dotenv').config();
const { Pool } = require('pg');

async function checkUsers() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query('SELECT id, email, name, role FROM users');
    console.log('Users in database:');
    result.rows.forEach(user => {
      console.log(`  - ${user.email} (${user.name}) - ${user.role}`);
    });
    if (result.rows.length === 0) {
      console.log('  (no users found - need to run seed)');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    pool.end();
  }
}

checkUsers();
