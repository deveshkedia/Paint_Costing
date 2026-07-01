require('dotenv').config({ path: '.env.local' });
const XLSX = require('xlsx');
const { Pool } = require('pg');

async function createSampleCostings() {
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
    console.log('📋 Creating sample costings...\n');

    // Get raw materials for mapping
    const materialsResult = await pool.query('SELECT id, name FROM raw_materials');
    const materialsByName = new Map(materialsResult.rows.map(m => [m.name.toLowerCase(), m.id]));

    const file = './Daily Cost Evaluation.xlsx';
    const workbook = XLSX.readFile(file);

    // Sheets to import as formulations
    const sheetNames = ['EZPP 28-4-22', 'APP 28-7-22', 'PU Grey 7012 - Jagdamba - 25062'];
    let productCount = 0;
    let formulationCount = 0;

    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        console.log(`⚠️  Sheet "${sheetName}" not found, skipping`);
        continue;
      }

      const data = XLSX.utils.sheet_to_json(sheet);

      // Extract product name and materials
      let productName = sheetName;
      const materials = [];

      // Parse the sheet - skip headers and extract material rows
      for (const row of data) {
        const materialName = row['Ep. Zinc Phosphate Grey Primer | 28/04/2022 - LATEST'] ||
                            row['APP 28-7-22'] ||
                            row['PU Grey 7012 - Jagdamba - 25062'] ||
                            '';

        const percent = parseFloat(row['__EMPTY']) || 0;

        if (materialName && percent > 0 && !materialName.includes('Raw Materials') && materialName.toLowerCase() !== 'total') {
          const materialId = materialsByName.get(materialName.toLowerCase().trim());
          if (materialId) {
            materials.push({ id: materialId, name: materialName, percent });
          }
        }
      }

      if (materials.length === 0) {
        console.log(`⏭️  No materials found in "${sheetName}", skipping`);
        continue;
      }

      // Create product
      const productResult = await pool.query(
        'INSERT INTO products (name, category, pack_type) VALUES ($1, $2, $3) RETURNING id',
        [sheetName.substring(0, 100), 'Epoxy Paint', 'single']
      );
      const productId = productResult.rows[0].id;
      productCount++;
      console.log(`✓ Created product: ${sheetName}`);

      // Create formulation
      const formulationResult = await pool.query(
        'INSERT INTO formulations (product_id, customer_name, batch_size_kg) VALUES ($1, $2, $3) RETURNING id',
        [productId, 'Standard', 100]
      );
      const formulationId = formulationResult.rows[0].id;
      formulationCount++;

      // Add materials to formulation
      for (const material of materials) {
        const qtyKg = (parseFloat(material.percent) / 100) * 100; // batch size 100kg
        await pool.query(
          'INSERT INTO formulation_lines (formulation_id, raw_material_id, side, qty_kg, percent) VALUES ($1, $2, $3, $4, $5)',
          [formulationId, material.id, 'single', qtyKg, parseFloat(material.percent)]
        );
      }

      console.log(`  └─ Created formulation with ${materials.length} materials\n`);
    }

    console.log(`✅ Created ${productCount} products and ${formulationCount} formulations\n`);

    // Create quotes using the formulations
    console.log('Creating sample quotes...\n');

    const formulations = await pool.query(`
      SELECT f.id, f.product_id, p.name as product_name FROM formulations f
      JOIN products p ON f.product_id = p.id
      LIMIT 3
    `);

    let quoteCount = 0;
    for (const form of formulations.rows) {
      // Create quote
      const quoteResult = await pool.query(
        'INSERT INTO quotes (name, client_name, margin_pct, gst_pct, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [`Quote - ${form.product_name}`, `Client - ${new Date().toLocaleDateString('en-IN')}`, 18, 18, 1]
      );
      const quoteId = quoteResult.rows[0].id;
      quoteCount++;

      // Get formulation cost for quote line
      const costResult = await pool.query(`
        SELECT
          COALESCE(SUM(rm.price_per_kg * fl.qty_kg), 0) as cost_per_kg_snap,
          COALESCE(SUM(rm.price_per_kg * fl.qty_kg), 0) as cost_per_litre_snap
        FROM formulation_lines fl
        JOIN raw_materials rm ON fl.raw_material_id = rm.id
        WHERE fl.formulation_id = $1
      `, [form.id]);

      const costPerKg = parseFloat(costResult.rows[0]?.cost_per_kg_snap || 0);
      const costPerLitre = parseFloat(costResult.rows[0]?.cost_per_litre_snap || 0);
      const lineTotal = costPerKg * 100; // 100kg quantity

      // Add line item to quote
      await pool.query(
        'INSERT INTO quote_lines (quote_id, formulation_id, product_name, customer_spec, quantity_kg, cost_per_kg_snap, cost_per_litre_snap, line_total) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [quoteId, form.id, form.product_name, 'Standard', 100, costPerKg, costPerLitre, lineTotal]
      );

      console.log(`✓ Created quote for ${form.product_name}`);
    }

    console.log(`\n✅ Created ${quoteCount} sample quotes\n`);
    console.log('All done! Sample data has been created.');
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
}

createSampleCostings();
