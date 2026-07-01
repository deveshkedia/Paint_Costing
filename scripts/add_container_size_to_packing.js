require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function migrate() {
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
    console.log('🔄 Adding container_size_litres field to packing_materials...\n');

    // Check if column already exists
    const checkResult = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'packing_materials' AND column_name = 'container_size_litres'
    `);

    if (checkResult.rows.length > 0) {
      console.log('✓ Column already exists');
      pool.end();
      return;
    }

    // Add column
    await pool.query(`
      ALTER TABLE packing_materials
      ADD COLUMN container_size_litres NUMERIC DEFAULT 1;
    `);

    console.log('✅ Migration complete!\n');
    console.log('📝 Update your packing materials:');
    console.log('   For "20 litre drum" costing 200 Rs:');
    console.log('   - Set cost = 200');
    console.log('   - Set container_size_litres = 20');
    console.log('   - System will calculate: 200 ÷ 20 = 10 Rs/litre\n');

  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
