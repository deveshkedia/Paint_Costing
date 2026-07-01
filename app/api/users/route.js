import { NextResponse } from "next/server";
import { query } from "../../../lib/db";
import { requireAdmin } from "../../../lib/apiGuard";
import { hashPassword } from "../../../lib/auth";

export async function GET(request) {
  const user = requireAdmin(request);
  if (user instanceof NextResponse) return user;

  const result = await query(`SELECT id, name, email, role, created_at FROM users ORDER BY created_at ASC`);
  return NextResponse.json({ users: result.rows });
}

export async function POST(request) {
  const user = requireAdmin(request);
  if (user instanceof NextResponse) return user;

  try {
    const { name, email, password, role } = await request.json();
    if (!name || !email || !password) {
      return NextResponse.json({ error: "Name, email, and password are required." }, { status: 400 });
    }
    if (role && !["admin", "estimator"].includes(role)) {
      return NextResponse.json({ error: "Role must be 'admin' or 'estimator'." }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4)
       RETURNING id, name, email, role, created_at`,
      [name.trim(), email.toLowerCase().trim(), passwordHash, role || "estimator"]
    );
    return NextResponse.json({ user: result.rows[0] }, { status: 201 });
  } catch (err) {
    if (err.code === "23505") {
      return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    }
    console.error("Create user error:", err);
    return NextResponse.json({ error: "Could not create user." }, { status: 500 });
  }
}
