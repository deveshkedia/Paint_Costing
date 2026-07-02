const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Starting migration: batch_size_kg -> batch_size_litres...');

    await client.query(`
      ALTER TABLE formulations
      RENAME COLUMN batch_size_kg TO batch_size_litres;
    `);

    console.log('✓ Successfully renamed batch_size_kg to batch_size_litres');

    await client.query('COMMIT');
  } catch (err) {
    console.error('Migration failed:', err);
    await client.query('ROLLBACK');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
