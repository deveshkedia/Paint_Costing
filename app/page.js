"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/AuthContext";
import { Loader2 } from "lucide-react";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.push(user ? "/products" : "/login");
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <Loader2 className="animate-spin text-rust" size={28} />
    </div>
  );
}
