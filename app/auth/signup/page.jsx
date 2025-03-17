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