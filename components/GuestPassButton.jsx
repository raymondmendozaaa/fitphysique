"use client";
import { useState } from "react";

export default function GuestPassButton({ email, price }) {
  const [loading, setLoading] = useState(false);

  const handlePurchase = async () => {
    setLoading(true);

    const res = await fetch("/api/guest-pass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, price }),
    });

    const data = await res.json();
    setLoading(false);

    if (data.sessionId) {
      window.location.href = `https://checkout.stripe.com/pay/${data.sessionId}`;
    } else {
      alert("Error processing payment.");
    }
  };

  return (
    <button
      onClick={handlePurchase}
      disabled={loading}
      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
    >
      {loading ? "Processing..." : "Buy Guest Pass"}
    </button>
  );
}