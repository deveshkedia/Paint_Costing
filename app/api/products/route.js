import { NextResponse } from "next/server";
import { query } from "../../../lib/db";
import { requireAuth, requireAdmin, rejectRmManager } from "../../../lib/apiGuard";

export async function GET(request) {
  const user = rejectRmManager(request);
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  if (!search) {
    const result = await query(
      `SELECT p.id, p.name, p.category, p.pack_type, p.notes, p.is_active, p.created_at,
              COUNT(f.id) AS formulation_count, NULL AS matched_customer
       FROM products p
       LEFT JOIN formulations f ON f.product_id = p.id AND f.is_active = true
       GROUP BY p.id
       ORDER BY p.name ASC`
    );
    return NextResponse.json({ products: result.rows });
  }

  // Search matches product name OR any attached formulation's customer name.
  // When the match came from a customer name (not the product name itself),
  // surface that matched customer so the UI can show why this product appeared.
  const result = await query(
    `SELECT DISTINCT p.id, p.name, p.category, p.pack_type, p.notes, p.is_active, p.created_at,
            (SELECT COUNT(*) FROM formulations f2 WHERE f2.product_id = p.id AND f2.is_active = true) AS formulation_count,
            (SELECT f3.customer_name FROM formulations f3
               WHERE f3.product_id = p.id AND f3.is_active = true AND f3.customer_name ILIKE $1
               LIMIT 1) AS matched_customer
     FROM products p
     LEFT JOIN formulations f ON f.product_id = p.id AND f.is_active = true
     WHERE p.name ILIKE $1 OR f.customer_name ILIKE $1
     ORDER BY p.name ASC`,
    [`%${search}%`]
  );
  return NextResponse.json({ products: result.rows });
}

export async function POST(request) {
  const user = requireAdmin(request);
  if (user instanceof NextResponse) return user;

  try {
    const { name, category, packType, notes } = await request.json();
    if (!name || !packType) {
      return NextResponse.json({ error: "Name and pack type are required." }, { status: 400 });
    }
    if (!["single", "two_pack", "three_pack"].includes(packType)) {
      return NextResponse.json({ error: "Pack type must be 'single', 'two_pack', or 'three_pack'." }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO products (name, category, pack_type, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, category, pack_type, notes, is_active, created_at`,
      [name.trim(), category || "industrial", packType, notes || null]
    );
    return NextResponse.json({ product: result.rows[0] }, { status: 201 });
  } catch (err) {
    console.error("Create product error:", err);
    return NextResponse.json({ error: "Could not create product." }, { status: 500 });
  }
}
