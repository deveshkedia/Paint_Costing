import { NextResponse } from "next/server";
import { query } from "../../../lib/db";
import { requireAuth, requireAdmin, rejectRmManager } from "../../../lib/apiGuard";

export async function GET(request) {
  const user = rejectRmManager(request);
  if (user instanceof NextResponse) return user;

  const result = await query(
    `SELECT id, name, pack_role, cost, notes, is_active, updated_at
     FROM packing_materials
     ORDER BY pack_role ASC, name ASC`
  );
  return NextResponse.json({ packingMaterials: result.rows });
}

export async function POST(request) {
  const user = requireAdmin(request);
  if (user instanceof NextResponse) return user;

  try {
    const { name, packRole, cost, notes } = await request.json();
    if (!name || cost === undefined) {
      return NextResponse.json({ error: "Name and cost are required." }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO packing_materials (name, pack_role, cost, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, pack_role, cost, notes, is_active, updated_at`,
      [name.trim(), packRole || "single", cost, notes || null]
    );
    return NextResponse.json({ packingMaterial: result.rows[0] }, { status: 201 });
  } catch (err) {
    if (err.code === "23505") {
      return NextResponse.json({ error: "A packing material with this name already exists." }, { status: 409 });
    }
    console.error("Create packing material error:", err);
    return NextResponse.json({ error: "Could not create packing material." }, { status: 500 });
  }
}
