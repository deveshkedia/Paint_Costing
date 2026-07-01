import { NextResponse } from "next/server";
import { requireAuth } from "../../../../../lib/apiGuard";
import { computeFormulationCost } from "../../../../../lib/costing";

export async function GET(request, { params }) {
  const user = requireAuth(request);
  if (user instanceof NextResponse) return user;

  const { id } = params;
  try {
    const cost = await computeFormulationCost(id);
    return NextResponse.json({ cost });
  } catch (err) {
    return NextResponse.json({ error: "Could not compute cost." }, { status: 404 });
  }
}
