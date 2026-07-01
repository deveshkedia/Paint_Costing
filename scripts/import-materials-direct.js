require('dotenv').config({ path: '.env.local' });
const XLSX = require('xlsx');
const { Pool } = require('pg');

async function importMaterials() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  try {
    // Extract raw materials from Excel
    const file = './Daily Cost Evaluation.xlsx';
    const workbook = XLSX.readFile(file);
    const sheet = workbook.Sheets['RM Master File'];

    const materials = [];
    const cells = Object.keys(sheet).filter(k => !k.startsWith('!'));

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.startsWith('A') && cell !== 'A1' && cell !== 'A2') {
        const row = parseInt(cell.slice(1));
        const nameCell = sheet[`A${row}`];
        const priceCell = sheet[`B${row}`];

        if (nameCell && priceCell) {
          const name = nameCell.v;
          const price = parseFloat(priceCell.v);

          if (name && price && typeof name === 'string' && !isNaN(price)) {
            materials.push({ name: name.trim(), pricePerKg: price });
          }
        }
      }
    }

    console.log(`📦 Found ${materials.length} raw materials\n`);
    console.log('Inserting into database...\n');

    let added = 0;
    let skipped = 0;

    for (const material of materials) {
      try {
        // Check if material already exists
        const existing = await pool.query(
          'SELECT id FROM raw_materials WHERE LOWER(name) = LOWER($1)',
          [material.name]
        );

        if (existing.rows.length > 0) {
          skipped++;
          continue;
        }

        // Insert material
        await pool.query(
          'INSERT INTO raw_materials (name, price_per_kg, density_kg_per_litre, supplier) VALUES ($1, $2, $3, $4)',
          [material.name, material.pricePerKg, 1, '']
        );

        added++;
        if (added % 50 === 0) process.stdout.write(`${added}.. `);
      } catch (err) {
        console.error(`Error adding ${material.name}:`, err.message);
      }
    }

    console.log(`\n\n✅ Successfully added ${added} raw materials`);
    if (skipped > 0) console.log(`⏭️  Skipped ${skipped} (already exist)`);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

importMaterials();
