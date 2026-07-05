import { showSuccess, showError, showLoading, dismissToast } from "@/lib/utils/toastUtils";
import { supabase } from "@/lib/supabaseClient";

export async function handleCheckIn(router) {
  const toastId = showLoading("Checking location...");

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData?.session) {
      dismissToast(toastId);
      showError("Session expired, please log in again.");
      router.push("/auth/login");
      return;
    }

    if (!navigator.geolocation) {
      dismissToast(toastId);
      showError("Geolocation not supported by your browser.");
      return;
    }

    let bestPosition = null;
    let bestAccuracy = Infinity;
    let completed = false;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        console.log(`📡 Got GPS fix: ${latitude} ${longitude} Accuracy: ${accuracy} meters`);

        if (accuracy < bestAccuracy) {
          bestAccuracy = accuracy;
          bestPosition = position;
        }

        // ✅ If accuracy meets our threshold early, continue immediately
        if (accuracy <= 50 && !completed) {
          completed = true;
          finishCheckIn(
            bestPosition,
            sessionData.session.access_token,
            router,
            toastId,
            watchId
          );
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        dismissToast(toastId);
        showError("Failed to get location. Please enable GPS.");
        navigator.geolocation.clearWatch(watchId);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );

    // ✅ After 20s, use the best reading or show error if none good enough
    setTimeout(() => {
      if (completed) return;

      navigator.geolocation.clearWatch(watchId);

      if (bestPosition && bestAccuracy <= 75) {
        completed = true;
        finishCheckIn(
          bestPosition,
          sessionData.session.access_token,
          router,
          toastId,
          null
        );
      } else {
        completed = true;
        dismissToast(toastId);
        console.warn("⏳ GPS fix timed out or too inaccurate.");
        showError("Could not get accurate location. Move outside or enable high accuracy.");
      }
    }, 20000);

  } catch (err) {
    dismissToast(toastId);
    console.error("Check-in error:", err);
    showError("Something went wrong during check-in.");
  }
}

async function finishCheckIn(position, accessToken, router, toastId, watchId) {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);

  try {
    const { latitude, longitude, accuracy } = position.coords;
    console.log(
      `✅ Using best GPS fix: ${latitude} ${longitude} Accuracy: ${accuracy} meters`
    );

    const response = await fetch("/api/check-in", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        latitude,
        longitude,
        accuracy,
        method: "geolocation",
      }),
    });

    const data = await response.json().catch(() => ({}));
    dismissToast(toastId);

    if (!response.ok) {
      console.warn("🚨 Server responded with error:", data.error);
      showError(data.error || "Check-in failed.");
      return;
    }

    showSuccess(
      `Checked into ${data.location.name} (${Math.round(data.distance)} meters away)`
    );
  } catch (error) {
    dismissToast(toastId);
    console.error("finishCheckIn error:", error);
    showError("Check-in failed. Please try again.");
  }
}