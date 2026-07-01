"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/AuthContext";
import NavBar from "./NavBar";
import BackupPrompt from "./BackupPrompt";
import { Loader2 } from "lucide-react";

export default function ProtectedPage({ children, adminOnly = false, allowedRoles = null }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && adminOnly && user.role !== "admin") router.push("/raw-materials");
    if (!loading && user && allowedRoles && !allowedRoles.includes(user.role)) router.push("/raw-materials");
  }, [loading, user, adminOnly, allowedRoles, router]);

  const isAuthorized = !adminOnly && (!allowedRoles || allowedRoles.includes(user?.role));
  const isAdminAuthorized = adminOnly ? user?.role === "admin" : true;

  if (loading || !user || (adminOnly && user.role !== "admin") || (allowedRoles && !allowedRoles.includes(user?.role))) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <Loader2 className="animate-spin text-rust" size={28} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <NavBar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        {user.role === "admin" && <BackupPrompt />}
        {children}
      </main>
    </div>
  );
}
