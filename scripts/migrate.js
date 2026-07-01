// Applies schema.sql to the database configured via DATABASE_URL.
// Run with: npm run db:migrate
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

  const sql = fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8");

  try {
    await pool.query(sql);
    console.log("✓ Schema applied successfully.");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
