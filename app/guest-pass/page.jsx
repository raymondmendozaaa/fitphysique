"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { loadStripe } from "@stripe/stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY);

export default function GuestPassPage() {
  const [email, setEmail] = useState("");
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchLocations = async () => {
      const { data, error } = await supabase.from("locations").select("*");
      if (error) console.error("Error fetching locations:", error.message);
      else setLocations(data);
    };

    fetchLocations();
  }, []);

  const handlePurchase = async () => {
    if (!email || !selectedLocation) {
      setError("Please enter an email and select a location.");
      return;
    }

    setLoading(true);
    setError("");

    // Send request to API route for Stripe checkout session
    const res = await fetch("/api/guest-pass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, location_id: selectedLocation, quantity }),
    });

    const { sessionId, error } = await res.json();
    setLoading(false);

    if (error) {
      setError(error);
      return;
    }

    // Redirect to Stripe checkout
    const stripe = await stripePromise;
    await stripe.redirectToCheckout({ sessionId });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
      <h1 className="text-3xl font-bold">Purchase Guest Pass</h1>
      {error && <p className="text-red-500 mt-2">{error}</p>}

      <div className="mt-6 flex flex-col gap-4 w-80">
        <input
          type="email"
          placeholder="Enter your email"
          className="p-2 text-black rounded"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <select
          value={selectedLocation}
          onChange={(e) => setSelectedLocation(e.target.value)}
          className="p-2 text-black rounded"
        >
          <option value="">Select Gym Location</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name} ({loc.city})
            </option>
          ))}
        </select>

        {/* Guest Pass Quantity Selector */}
        <select
          value={quantity}
          onChange={(e) => setQuantity(parseInt(e.target.value))}
          className="p-2 text-black rounded"
        >
          {[...Array(10)].map((_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1} Guest Pass{ i + 1 > 1 ? 'es' : '' }
            </option>
          ))}
        </select>

        <button
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
          onClick={handlePurchase}
          disabled={loading}
        >
          {loading ? "Processing..." : "Purchase Guest Pass"}
        </button>
      </div>
    </div>
  );
}