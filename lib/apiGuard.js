import { NextResponse } from "next/server";
import { getUserFromRequest } from "./auth";

/**
 * Returns the authenticated user or sends a 401 response.
 * Usage: const user = requireAuth(request); if (user instanceof NextResponse) return user;
 */
export function requireAuth(request) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  return user;
}

/**
 * Returns the authenticated admin user or sends a 401/403 response.
 */
export function requireAdmin(request) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  return user;
}

/**
 * Returns the authenticated user if they are admin or rm_manager, or sends a 401/403 response.
 * Used for raw materials management.
 */
export function requireRmManagerOrAdmin(request) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (user.role !== "admin" && user.role !== "rm_manager") {
    return NextResponse.json({ error: "Raw materials management access required." }, { status: 403 });
  }
  return user;
}

/**
 * Rejects rm_manager users. Used for routes that should only be accessible to admin and estimator.
 */
export function rejectRmManager(request) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (user.role === "rm_manager") {
    return NextResponse.json({ error: "Access denied. RM Managers can only manage raw materials." }, { status: 403 });
  }
  return user;
}
