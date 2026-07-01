import { NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../lib/auth";

export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  return NextResponse.json({ user });
}
