import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { requireAdmin } from "../../../../lib/apiGuard";

export async function PUT(request, { params }) {
  const user = requireAdmin(request);
  if (user instanceof NextResponse) return user;

  const { id } = params;
  try {
    const { name, packRole, cost, notes, isActive } = await request.json();
    const result = await query(
      `UPDATE packing_materials
       SET name = COALESCE($1, name),
           pack_role = COALESCE($2, pack_role),
           cost = COALESCE($3, cost),
           notes = COALESCE($4, notes),
           is_active = COALESCE($5, is_active),
           updated_at = now()
       WHERE id = $6
       RETURNING id, name, pack_role, cost, notes, is_active, updated_at`,
      [name, packRole, cost, notes, isActive, id]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Packing material not found." }, { status: 404 });
    }
    return NextResponse.json({ packingMaterial: result.rows[0] });
  } catch (err) {
    console.error("Update packing material error:", err);
    return NextResponse.json({ error: "Could not update packing material." }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const user = requireAdmin(request);
  if (user instanceof NextResponse) return user;

  const { id } = params;
  try {
    const result = await query(
      `UPDATE packing_materials SET is_active = false, updated_at = now() WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Packing material not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete packing material error:", err);
    return NextResponse.json({ error: "Could not delete packing material." }, { status: 500 });
  }
}
