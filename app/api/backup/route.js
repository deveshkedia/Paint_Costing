import { NextResponse } from "next/server";
import { getPool, query } from "../../../lib/db";
import { requireAdmin } from "../../../lib/apiGuard";

/**
 * GET: tells the frontend whether a backup prompt should be shown — true
 * if the most recent backup_log entry is more than 7 days old (or there
 * isn't one yet).
 */
export async function GET(request) {
  const user = requireAdmin(request);
  if (user instanceof NextResponse) return user;

  const result = await query(`SELECT taken_at FROM backup_log ORDER BY taken_at DESC LIMIT 1`);
  const lastBackup = result.rows[0]?.taken_at || null;
  const daysSince = lastBackup ? (Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24) : Infinity;

  return NextResponse.json({
    lastBackupAt: lastBackup,
    shouldPrompt: daysSince >= 7,
    daysSinceLastBackup: lastBackup ? Math.floor(daysSince) : null,
  });
}

/**
 * POST: exports every table as JSON for the admin to download, AND logs
 * that a backup was taken (so the weekly prompt resets).
 */
export async function POST(request) {
  const user = requireAdmin(request);
  if (user instanceof NextResponse) return user;

  const pool = getPool();
  try {
    const tables = [
      "users",
      "raw_materials",
      "raw_material_price_history",
      "packing_materials",
      "products",
      "formulations",
      "formulation_lines",
      "formulation_cost_history",
      "quotes",
      "quote_lines",
    ];

    const dump = {};
    for (const table of tables) {
      const result = await pool.query(`SELECT * FROM ${table}`);
      // Never include password hashes in an exported backup file.
      dump[table] = table === "users" ? result.rows.map(({ password_hash, ...rest }) => rest) : result.rows;
    }

    await pool.query(`INSERT INTO backup_log (taken_by, notes) VALUES ($1, $2)`, [user.id, "Manual export via app"]);

    return NextResponse.json({ exportedAt: new Date().toISOString(), data: dump });
  } catch (err) {
    console.error("Backup export error:", err);
    return NextResponse.json({ error: "Could not generate backup." }, { status: 500 });
  }
}
