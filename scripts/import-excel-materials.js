require('dotenv').config({ path: '.env.local' });
const XLSX = require('xlsx');
const fetch = require('node-fetch');

async function addRawMaterials() {
  // Step 1: Login
  console.log('🔐 Logging in...');
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'anupam@anupampaints.com',
      password: 'changeme123'
    })
  });

  if (!loginRes.ok) {
    console.log('Login failed:', loginRes.status);
    return;
  }

  const cookies = loginRes.headers.get('set-cookie');
  console.log('✓ Logged in successfully\n');

  // Step 2: Extract raw materials from Excel
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

  console.log(`📦 Found ${materials.length} raw materials`);
  console.log('Adding to database...\n');

  // Step 3: Add to database with authentication
  let added = 0;
  let failed = 0;

  for (const material of materials) {
    try {
      const res = await fetch('http://localhost:3000/api/raw-materials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookies
        },
        body: JSON.stringify({
          name: material.name,
          pricePerKg: material.pricePerKg,
          densityKgPerLitre: 1,
          supplier: ''
        })
      });

      if (res.ok) {
        added++;
        if (added % 50 === 0) process.stdout.write(`${added}.. `);
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
    }
  }

  console.log(`\n\n✅ Successfully added ${added}/${materials.length} raw materials!`);
  if (failed > 0) console.log(`⚠️  Failed: ${failed}`);
}

addRawMaterials().catch(e => console.error('Error:', e.message));
