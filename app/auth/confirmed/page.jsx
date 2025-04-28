"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ConfirmedPage() {
  const router = useRouter();

  useEffect(() => {
    setTimeout(() => {
      router.push("/dashboard"); // Redirect after 3 seconds
    }, 3000);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <div className="p-6 bg-gray-800 rounded-lg shadow-lg text-center">
        <h1 className="text-2xl font-bold">Email Confirmed ✅</h1>
        <p className="mt-2 text-gray-400">Redirecting you to your dashboard...</p>
      </div>
    </div>
  );
}