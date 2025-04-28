<<<<<<< HEAD
"use client";

import { useState } from "react";
import useSignup from "@/lib/hooks/useSignup";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const { signup, loading } = useSignup();

  const handleSignup = (e) => {
    e.preventDefault();
    signup({ fullName, email, password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 py-20 px-4 mt-20">
      <form
        onSubmit={handleSignup}
        className="w-full max-w-md bg-gray-900 p-6 rounded-xl shadow-xl space-y-4 text-white"
      >
        <h2 className="text-2xl font-bold text-center">Create Account</h2>

        <input
          type="text"
          placeholder="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full p-3 bg-gray-800 rounded"
          required
        />

        <input
          type="email"
          placeholder="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 bg-gray-800 rounded"
          required
        />

        <input
          type="password"
          placeholder="Create Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-3 bg-gray-800 rounded"
          required
        />

        <button
          type="submit"
          className="w-full py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded"
          disabled={loading}
        >
          {loading ? "Creating Account..." : "Sign Up"}
        </button>
      </form>
    </div>
  );
}

/*
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [profileImage, setProfileImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [plansWithDurations, setPlansWithDurations] = useState({});
  const [selectedPlan, setSelectedPlan] = useState("");
  const [selectedDurationId, setSelectedDurationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchPlanDurations = async () => {
      const { data, error } = await supabase
        .from("plan_durations")
        .select("id, plan_name, duration_label, requires_contract");

      if (error) {
        console.error("Error fetching plan durations:", error);
        return;
      }

      const grouped = {};
      data.forEach((item) => {
        if (!grouped[item.plan_name]) grouped[item.plan_name] = [];
        grouped[item.plan_name].push(item);
      });
      setPlansWithDurations(grouped);
    };

    fetchPlanDurations();
  }, []);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setProfileImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const user = data.user;
    if (!user) {
      setError("User registration failed.");
      setLoading(false);
      return;
    }

    // ✅ Get session for authenticated storage upload
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      setError("User must be logged in before uploading profile picture.");
      setLoading(false);
      return;
    }
    
    // Upload profile picture
    let profileUrl = null;
    if (profileImage) {
      const fileExt = profileImage.name.split(".").pop();
      const filePath = `${user.id}.${fileExt}`;

      console.log("📁 Uploading file:", profileImage); // 🔍 Check file exists

      const { error: uploadError } = await supabase.storage
        .from("profile-pictures")
        .upload(filePath, profileImage, {
          cacheControl: "3600",
          upsert: true,
          contentType: profileImage.type,
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
      
      

      if (uploadError) {
        console.error("❌ Upload Error:", uploadError); // 🔍 Detailed error
        setError(uploadError.message);
        setLoading(false);
        return;
      }

      const { data: publicURLData } = supabase.storage
        .from("profile-pictures")
        .getPublicUrl(filePath);

      profileUrl = publicURLData.publicUrl;
    }

    // Insert into users table
    const { error: userInsertError } = await supabase.from("users").insert([
      {
        id: user.id,
        email,
        full_name: fullName,
        role: "member",
        profile_url: profileUrl,
      },
    ]);

    if (userInsertError) {
      setError(userInsertError.message);
      setLoading(false);
      return;
    }

    // Insert into memberships table
    const { error: membershipError } = await supabase.from("memberships").insert([
      {
        user_id: user.id,
        plan_duration_id: selectedDurationId,
      },
    ]);

    if (membershipError) {
      setError(membershipError.message);
      setLoading(false);
      return;
    }

    alert("Account created successfully! Please log in.");
    router.push("/auth/login");
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 py-20 px-4 mt-20">
      <form
        onSubmit={handleSignup}
        className="w-full max-w-md bg-gray-900 p-6 rounded-xl shadow-xl space-y-4 text-white"
      >
        <h2 className="text-2xl font-bold text-center">Create Account</h2>

        {error && <p className="text-red-500">{error}</p>}

        <input
          type="text"
          placeholder="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full p-3 bg-gray-800 rounded"
          required
        />

        <input
          type="email"
          placeholder="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 bg-gray-800 rounded"
          required
        />

        <input
          type="password"
          placeholder="Create Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-3 bg-gray-800 rounded"
          required
        />

        // Profile Picture Upload
        <div className="flex flex-col space-y-2">
          <label className="text-sm">Upload Profile Picture (required)</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="w-full bg-gray-800 p-2 rounded"
            required
          />
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Preview"
              className="w-24 h-24 rounded-full mt-2 object-cover border border-gray-600"
            />
          )}
        </div>

        // Membership Plan Dropdown
        <select
          value={selectedPlan}
          onChange={(e) => {
            setSelectedPlan(e.target.value);
            setSelectedDurationId(""); // Reset duration when plan changes
          }}
          className="w-full p-3 bg-gray-800 rounded"
          required
        >
          <option value="">Select Membership Plan</option>
          {Object.keys(plansWithDurations).map((planName) => (
            <option key={planName} value={planName}>
              {planName}
            </option>
          ))}
        </select>

        // Plan Duration Dropdown (hidden for Guest Pass) 
        {selectedPlan && selectedPlan !== "Guest Pass" && (
          <select
            value={selectedDurationId}
            onChange={(e) => {
              const selected = plansWithDurations[selectedPlan].find(
                (p) => p.id === e.target.value
              );
              setSelectedDurationId(e.target.value);
              if (selected?.requires_contract) {
                alert("Note: This duration requires a contract.");
              }
            }}
            className="w-full p-3 bg-gray-800 rounded"
            required
          >
            <option value="">Select Plan Duration</option>
            {plansWithDurations[selectedPlan]?.map(({ id, duration_label }) => (
              <option key={id} value={id}>
                {duration_label}
              </option>
            ))}
          </select>
        )}

        <button
          type="submit"
          className="w-full py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded"
          disabled={loading}
        >
          {loading ? "Creating Account..." : "Sign Up"}
        </button>
      </form>
    </div>
  );
}
*/
=======
const handleSignup = async (e) => {
  e.preventDefault();
  setLoading(true);
  setError("");

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    setError(error.message);
    setLoading(false);
    return;
  }

  const user = data.user;
  if (!user) {
    setError("User registration failed.");
    setLoading(false);
    return;
  }

  // **🔹 If Guest Pass is selected, go directly to Stripe**
  if (membershipPlan === "Guest Pass") {
    const res = await fetch("/api/guest-pass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id }),
    });

    const { url } = await res.json();
    if (url) {
      window.location.href = url; // Redirect to Stripe checkout
      return;
    }
  }

  // **Otherwise, proceed with inserting into Supabase**
  const { error: userInsertError } = await supabase.from("users").insert([
    { id: user.id, email, full_name: fullName, role: "member" },
  ]);

  if (userInsertError) {
    setError(userInsertError.message);
    setLoading(false);
    return;
  }

  const { error: membershipError } = await supabase.from("memberships").insert([
    { user_id: user.id, plan: membershipPlan, contract: contractLength },
  ]);

  if (membershipError) {
    setError(membershipError.message);
    setLoading(false);
    return;
  }

  alert("Account created successfully! Please log in.");
  router.push("/auth/login");
  setLoading(false);
};
>>>>>>> a13871cbcb0587d21345b91f28863c3e4151a8e6
