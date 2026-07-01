// Applies any .sql files in /migrations, in filename order, against
// DATABASE_URL. Safe to re-run — every migration file is written with
// IF NOT EXISTS / DROP CONSTRAINT IF EXISTS so re-applying is harmless.
// Run with: npm run db:migrate2
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") });
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Add it to your .env.local or environment.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("sslmode=require") || process.env.PGSSL === "true"
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const migrationsDir = path.join(__dirname, "..", "migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  if (files.length === 0) {
    console.log("No migration files found in /migrations.");
    await pool.end();
    return;
  }

  try {
    for (const file of files) {
      console.log(`Applying ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await pool.query(sql);
      console.log(`✓ ${file} applied.`);
    }
    console.log("✓ All migrations applied successfully.");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
