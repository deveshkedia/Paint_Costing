// Creates the first admin user so you can log in.
// Run with: npm run db:seed
// Reads ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD from environment, or uses defaults below.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") });
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const name = process.env.ADMIN_NAME || "Anupam Kedia";
  const email = (process.env.ADMIN_EMAIL || "anupam@anupampaints.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "changeme123";

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("sslmode=require") || process.env.PGSSL === "true"
      ? { rejectUnauthorized: false }
      : undefined,
  });

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      console.log(`User ${email} already exists. Skipping.`);
      return;
    }
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')`,
      [name, email, hash]
    );
    console.log(`✓ Admin user created: ${email} / ${password}`);
    console.log("  Please log in and consider changing this password (a password-change feature can be added on request).");
  } catch (err) {
    console.error("Seed failed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
