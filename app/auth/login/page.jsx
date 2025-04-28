"use client";

import { useState } from "react";
import Link from "next/link";
import useLogin from "@/lib/hooks/useLogin";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const {
    loading,
    resendLoading,
    handleLogin,
    handleResendConfirmation,
  } = useLogin();

  const onSubmit = (e) => {
    e.preventDefault();
    handleLogin(email, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <div className="p-8 bg-gray-800 shadow-lg rounded-lg w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6">LOGIN</h1>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            className="p-2 bg-gray-700 rounded border border-gray-600 focus:outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            className="p-2 bg-gray-700 rounded border border-gray-600 focus:outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white font-semibold"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        {/* 🔹 Resend Confirmation Email Section */}
        <div className="mt-4 text-center">
          <p className="text-sm">Didn’t receive a confirmation email?</p>
          <button
            onClick={() => handleResendConfirmation(email)}
            disabled={resendLoading}
            className="mt-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white font-semibold"
          >
            {resendLoading ? "Sending..." : "Resend Confirmation Email"}
          </button>
        </div>

        <p className="mt-4 text-sm text-center">
          Don't have an account?{" "}
          <Link href="/auth/signup" className="text-blue-500 hover:underline">
            Sign up here
          </Link>
        </p>
      </div>
    </div>
  );
}