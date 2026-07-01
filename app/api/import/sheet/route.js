import { NextResponse } from "next/server";
import { google } from "googleapis";
import { query } from "../../../../lib/db";
import { requireAdmin } from "../../../../lib/apiGuard";

/**
 * Pulls raw material prices from a Google Sheet and updates raw_materials
 * by matching on name (case-insensitive).
 *
 * Expected sheet layout (row 1 = headers, matched by name not position):
 *   Name | Price Per Kg | Density (kg/litre) | Supplier | Notes
 *
 * Setup required (see README "Google Sheets import" section):
 *   1. Create a Google Cloud service account, enable the Sheets API.
 *   2. Share the target sheet with the service account's email (Viewer is enough).
 *   3. Set env vars: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_KEY
 *      (the private key, with literal \n kept as \n — see .env.example).
 *
 * Body: { sheetId, sheetRange }  e.g. { sheetId: "1AbC...", sheetRange: "RawMaterials!A1:E500" }
 */
export async function POST(request) {
  const user = requireAdmin(request);
  if (user instanceof NextResponse) return user;

  const { sheetId, sheetRange } = await request.json();
  if (!sheetId || !sheetRange) {
    return NextResponse.json({ error: "sheetId and sheetRange are required." }, { status: 400 });
  }
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    return NextResponse.json(
      { error: "Google service account credentials are not configured on the server." },
      { status: 500 }
    );
  }

  try {
    const auth = new google.auth.JWT(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      null,
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY.replace(/\\n/g, "\n"),
      ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    );

    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: sheetRange });
    const rows = res.data.values || [];

    if (rows.length < 2) {
      return NextResponse.json({ error: "Sheet appears empty or has no data rows." }, { status: 400 });
    }

    const headers = rows[0].map((h) => h.toLowerCase().trim());
    const nameIdx = headers.findIndex((h) => h.includes("name"));
    const priceIdx = headers.findIndex((h) => h.includes("price"));
    const densityIdx = headers.findIndex((h) => h.includes("density"));
    const supplierIdx = headers.findIndex((h) => h.includes("supplier"));

    if (nameIdx === -1 || priceIdx === -1) {
      return NextResponse.json(
        { error: "Could not find 'Name' and 'Price Per Kg' columns in the sheet headers." },
        { status: 400 }
      );
    }

    let updated = 0;
    let created = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = (row[nameIdx] || "").trim();
      const priceRaw = row[priceIdx];
      if (!name || priceRaw === undefined || priceRaw === "") {
        skipped++;
        continue;
      }
      const price = parseFloat(String(priceRaw).replace(/[^0-9.]/g, ""));
      if (isNaN(price)) {
        errors.push(`Row ${i + 1}: could not parse price "${priceRaw}" for "${name}".`);
        continue;
      }
      const density = densityIdx !== -1 && row[densityIdx] ? parseFloat(row[densityIdx]) : null;
      const supplier = supplierIdx !== -1 ? row[supplierIdx] || null : null;

      const existing = await query(`SELECT id FROM raw_materials WHERE LOWER(name) = LOWER($1)`, [name]);
      if (existing.rows.length > 0) {
        await query(
          `UPDATE raw_materials
           SET price_per_kg = $1,
               density_kg_per_litre = COALESCE($2, density_kg_per_litre),
               supplier = COALESCE($3, supplier),
               updated_at = now()
           WHERE id = $4`,
          [price, density, supplier, existing.rows[0].id]
        );
        updated++;
      } else {
        await query(
          `INSERT INTO raw_materials (name, price_per_kg, density_kg_per_litre, supplier)
           VALUES ($1, $2, $3, $4)`,
          [name, price, density || 1.0, supplier]
        );
        created++;
      }
    }

    return NextResponse.json({ updated, created, skipped, errors });
  } catch (err) {
    console.error("Sheet import error:", err);
    return NextResponse.json(
      { error: "Could not import from Google Sheets. Check sheet sharing and credentials." },
      { status: 500 }
    );
  }
}
