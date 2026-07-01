import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import { requireAuth, rejectRmManager } from "../../../../lib/apiGuard";

export async function GET(request, { params }) {
  const user = rejectRmManager(request);
  if (user instanceof NextResponse) return user;

  const { id } = params;
  const quoteResult = await query(
    `SELECT q.*, u.name AS created_by_name FROM quotes q LEFT JOIN users u ON u.id = q.created_by WHERE q.id = $1`,
    [id]
  );
  const quote = quoteResult.rows[0];
  if (!quote) {
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }
  if (user.role !== "admin" && quote.created_by !== user.id) {
    return NextResponse.json({ error: "Not authorized to view this quote." }, { status: 403 });
  }

  const linesResult = await query(`SELECT * FROM quote_lines WHERE quote_id = $1 ORDER BY id ASC`, [id]);
  return NextResponse.json({ quote, lines: linesResult.rows });
}

export async function DELETE(request, { params }) {
  const user = requireAuth(request);
  if (user instanceof NextResponse) return user;

  const { id } = params;
  const existing = await query(`SELECT created_by FROM quotes WHERE id = $1`, [id]);
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }
  if (user.role !== "admin" && existing.rows[0].created_by !== user.id) {
    return NextResponse.json({ error: "Not authorized to delete this quote." }, { status: 403 });
  }

  await query(`DELETE FROM quotes WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
