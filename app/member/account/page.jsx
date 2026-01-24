// app/member/account/page.jsx
"use client";

import { useEffect, useState } from "react";
import withAuth from "@/lib/withAuth";
import { supabase } from "@/lib/supabaseClient";
import uploadProfileImage from "@/lib/helpers/uploadProfileImage";
import EmailChangeSection from "@/components/account/EmailChangeSection";
import {
  showError,
  showSuccess,
  showLoading,
  dismissToast,
} from "@/lib/utils/toastUtils";
import useUserData from "@/lib/hooks/useUserData";

function AccountPage({ user, profileUrl }) {
  const { updateUser } = useUserData();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPhoto, setCurrentPhoto] = useState(profileUrl || null);
  const [newPhotoFile, setNewPhotoFile] = useState(null);
  const [newPhotoPreview, setNewPhotoPreview] = useState(null);

  // NEW profile fields
  const [locations, setLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [preferredLocationId, setPreferredLocationId] = useState("");

  const [timezone, setTimezone] = useState("America/Chicago");
  const [birthday, setBirthday] = useState(""); // "YYYY-MM-DD"

  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateRegion, setStateRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");

  // Notification preferences
  const [notifyMembership, setNotifyMembership] = useState(true);
  const [notifyPayments, setNotifyPayments] = useState(true);
  const [notifyPromos, setNotifyPromos] = useState(false);
  const [notifyEvents, setNotifyEvents] = useState(false);

  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  // Load current profile data from users table
  useEffect(() => {
    if (!user?.id) return;

    (async () => {
      const { data, error } = await supabase
        .from("users")
        .select(
          `
          full_name,
          phone,
          profile_url,
          preferred_location_id,
          timezone,
          birthday,
          address_line1,
          address_line2,
          city,
          state,
          postal_code,
          notify_membership,
          notify_payments,
          notify_promos,
          notify_events
        `
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("[Account] Failed to load user profile:", error);
        showError("Failed to load your account details.");
        return;
      }

      if (!data) return;

      if (data.full_name) setFullName(data.full_name);
      if (data.phone) setPhone(data.phone);
      if (data.profile_url) setCurrentPhoto(data.profile_url);

      if (data.preferred_location_id) {
        setPreferredLocationId(data.preferred_location_id);
      }
      if (data.timezone) setTimezone(data.timezone);
      if (data.birthday) setBirthday(data.birthday); // "YYYY-MM-DD"

      if (data.address_line1) setAddressLine1(data.address_line1);
      if (data.address_line2) setAddressLine2(data.address_line2);
      if (data.city) setCity(data.city);
      if (data.state) setStateRegion(data.state);
      if (data.postal_code) setPostalCode(data.postal_code);

      setNotifyMembership(
        data.notify_membership !== null ? data.notify_membership : true
      );
      setNotifyPayments(
        data.notify_payments !== null ? data.notify_payments : true
      );
      setNotifyPromos(
        data.notify_promos !== null ? data.notify_promos : false
      );
      setNotifyEvents(
        data.notify_events !== null ? data.notify_events : false
      );
    })();
  }, [user]);

  // Load locations for preferred gym dropdown
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("locations")
          .select("id, name, city, state")
          .order("name", { ascending: true });

        if (error) {
          console.error("[Account] Failed to load locations:", error);
          setLocations([]);
          return;
        }

        setLocations(data || []);
      } catch (err) {
        console.error("[Account] locations unexpected error:", err);
        setLocations([]);
      } finally {
        setLocationsLoading(false);
      }
    })();
  }, []);

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      showError("Please select a valid image file.");
      return;
    }

    setNewPhotoFile(file);
    setNewPhotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user?.id) return;

    // Phone validation: only digits, require 10 if present
    const cleanedPhone = phone.replace(/\D/g, "");
    if (cleanedPhone && cleanedPhone.length !== 10) {
      showError("Please enter a valid 10-digit phone number.");
      return;
    }

    const trimmedName = fullName.trim();
    const trimmedAddress1 = addressLine1.trim();
    const trimmedAddress2 = addressLine2.trim();
    const trimmedCity = city.trim();
    const trimmedState = stateRegion.trim();
    const trimmedPostal = postalCode.trim();
    const trimmedBirthday = birthday ? birthday.trim() : "";

    setSaving(true);
    const toastId = showLoading("Saving your changes...");

    try {
      const updates = {};

      if (trimmedName) {
        updates.full_name = trimmedName;
      }

      if (newPhotoFile) {
        const url = await uploadProfileImage(newPhotoFile, user.id);
        updates.profile_url = url;
        setCurrentPhoto(url);
      }

      updates.phone = cleanedPhone || null;

      // Preferred location
      updates.preferred_location_id = preferredLocationId || null;

      // Timezone
      updates.timezone = timezone || "America/Chicago";

      // Birthday
      updates.birthday = trimmedBirthday || null;

      // Address fields
      updates.address_line1 = trimmedAddress1 || null;
      updates.address_line2 = trimmedAddress2 || null;
      updates.city = trimmedCity || null;
      updates.state = trimmedState || null;
      updates.postal_code = trimmedPostal || null;

      // Notification prefs
      updates.notify_membership = !!notifyMembership;
      updates.notify_payments = !!notifyPayments;
      updates.notify_promos = !!notifyPromos;
      updates.notify_events = !!notifyEvents;

      const { error: updateError } = await supabase
        .from("users")
        .update(updates)
        .eq("id", user.id);

      if (updateError) {
        console.error("[Account] Failed to update user:", updateError);
        throw new Error("Could not save your changes. Please try again.");
      }

      // keep global user context in sync (for header/avatar/name)
      const partial = {};
      if (updates.profile_url) {
        partial.profileUrl = updates.profile_url;
        partial.hasRealPhoto = true;
      }
      if (updates.full_name) {
        partial.full_name = updates.full_name;
      }
      if (Object.keys(partial).length > 0) {
        updateUser(partial);
      }

      dismissToast(toastId);
      showSuccess("Account updated successfully.");
      setNewPhotoFile(null);
      setNewPhotoPreview(null);
    } catch (err) {
      console.error("[Account] handleSubmit error:", err);
      dismissToast(toastId);
      showError(err.message || "Something went wrong while saving.");
    } finally {
      setSaving(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!user?.id) {
      showError("We couldn't find your account.");
      return;
    }

    setSendingReset(true);
    const toastId = showLoading("Sending password reset email...");

    try {
      const res = await fetch("/api/member/send-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          body?.error || "Could not send reset email. Please try again."
        );
      }

      dismissToast(toastId);
      showSuccess("If that email exists, we've sent a password reset link.");
    } catch (err) {
      console.error("[Account] handleSendPasswordReset error:", err);
      dismissToast(toastId);
      showError(
        err.message ||
          "Something went wrong while sending the reset email."
      );
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white pt-20">
      {/* Page header */}
      <header className="border-b border-gray-900/80 bg-gray-950/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Account Settings</h1>
            <p className="text-xs text-gray-400">
              Manage your profile, contact info, email, and password.
            </p>
          </div>
          {user?.email && (
            <p className="text-[11px] text-gray-500 truncate">
              Signed in as{" "}
              <span className="font-mono text-gray-300">{user.email}</span>
            </p>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-[2fr,1.6fr]">
          {/* Left column: profile form */}
          <form
            onSubmit={handleSubmit}
            className="bg-gray-900 p-6 rounded-2xl shadow-md space-y-6 border border-gray-800"
          >
            <h2 className="text-lg font-semibold mb-1">Profile</h2>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium mb-1">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-gray-800 p-3 rounded border border-gray-700"
                placeholder="Your full name"
              />
            </div>

            {/* Profile Picture */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Profile Picture
              </label>

              <div className="flex items-center gap-4">
                {newPhotoPreview || currentPhoto ? (
                  <img
                    src={newPhotoPreview || currentPhoto}
                    alt="Current avatar"
                    className="w-20 h-20 rounded-full object-cover border border-gray-600"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs text-gray-400">
                    No photo
                  </div>
                )}

                <label className="cursor-pointer bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-lg text-sm border border-gray-600">
                  Change Photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                </label>
              </div>
              
              {newPhotoPreview && (
                <p className="text-xs text-gray-400 mt-1">
                  New photo selected — click &quot;Save changes&quot; to apply.
                </p>
              )}
            </div>
            
            {/* Phone + Birthday side by side on larger screens */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Phone */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Phone (optional)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-gray-800 p-3 rounded border border-gray-700"
                  placeholder="Add a phone number"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Used if there&apos;s an issue with your membership or check-in.
                </p>
              </div>
            
              {/* Birthday */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Birthday (optional)
                </label>
                <input
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  className="w-full bg-gray-800 p-3 rounded border border-gray-700 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  For birthday rewards and special offers.
                </p>
              </div>
            </div>
            
            {/* Preferred Gym + Timezone side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Preferred Gym Location */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Preferred Gym Location
                </label>
                <select
                  className="w-full bg-gray-800 p-3 rounded border border-gray-700 text-sm"
                  value={preferredLocationId}
                  onChange={(e) => setPreferredLocationId(e.target.value)}
                >
                  <option value="">
                    {locationsLoading
                      ? "Loading locations..."
                      : "Select a home gym"}
                  </option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                      {loc.city ? ` — ${loc.city}` : ""}
                      {loc.state ? `, ${loc.state}` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Used for check-ins and location-based notifications.
                </p>
              </div>
                
              {/* Timezone */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Timezone
                </label>
                <select
                  className="w-full bg-gray-800 p-3 rounded border border-gray-700 text-sm"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  <option value="America/Chicago">
                    Central (America/Chicago)
                  </option>
                  <option value="America/Denver">
                    Mountain (America/Denver)
                  </option>
                  <option value="America/Los_Angeles">
                    Pacific (America/Los_Angeles)
                  </option>
                  <option value="America/New_York">
                    Eastern (America/New_York)
                  </option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Used for membership dates and notifications.
                </p>
              </div>
            </div>
                
            {/* Address */}
            <div>
              <label className="block text-sm font-medium mb-1">Address</label>
              <input
                type="text"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                className="w-full bg-gray-800 p-2.5 rounded border border-gray-700 text-sm mb-2"
                placeholder="Street address"
              />
              <input
                type="text"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                className="w-full bg-gray-800 p-2.5 rounded border border-gray-700 text-sm mb-2"
                placeholder="Apartment, suite, etc. (optional)"
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="bg-gray-800 p-2.5 rounded border border-gray-700 text-sm"
                  placeholder="City"
                />
                <input
                  type="text"
                  value={stateRegion}
                  onChange={(e) => setStateRegion(e.target.value)}
                  className="bg-gray-800 p-2.5 rounded border border-gray-700 text-sm"
                  placeholder="State"
                />
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="bg-gray-800 p-2.5 rounded border border-gray-700 text-sm"
                  placeholder="ZIP"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Helpful for local promos, family plans, and gym analytics.
              </p>
            </div>
                
            {/* Notification preferences */}
            <div className="border-t border-gray-800 pt-4 mt-2 space-y-2">
              <h3 className="text-sm font-semibold text-gray-200">
                Notifications
              </h3>
              <p className="text-xs text-gray-500 mb-1">
                Control what kinds of emails you receive from your gym.
              </p>
              <label className="flex items-center gap-2 text-sm text-gray-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-600 bg-gray-800"
                  checked={notifyMembership}
                  onChange={(e) => setNotifyMembership(e.target.checked)}
                />
                <span>Membership updates (status, renewals, changes)</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-600 bg-gray-800"
                  checked={notifyPayments}
                  onChange={(e) => setNotifyPayments(e.target.checked)}
                />
                <span>Payment receipts and billing reminders</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-600 bg-gray-800"
                  checked={notifyPromos}
                  onChange={(e) => setNotifyPromos(e.target.checked)}
                />
                <span>Promotions and guest pass offers</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-600 bg-gray-800"
                  checked={notifyEvents}
                  onChange={(e) => setNotifyEvents(e.target.checked)}
                />
                <span>Gym events, classes, and announcements</span>
              </label>
            </div>
                
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded-xl disabled:opacity-50 mt-2"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </form>

          {/* Right column: email + password */}
          <div className="space-y-4">
            {/* EmailChangeSection already renders its own card */}
            <EmailChangeSection />

            {/* Password reset card */}
            <div className="bg-gray-900 p-6 rounded-2xl shadow-md space-y-3 border border-gray-800">
              <h3 className="text-lg font-semibold">Password</h3>
              <p className="text-sm text-gray-400">
                Need to change your password? We&apos;ll email you a secure
                reset link.
              </p>
              <button
                type="button"
                onClick={handleSendPasswordReset}
                disabled={sendingReset}
                className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-sm rounded-xl disabled:opacity-50"
              >
                {sendingReset
                  ? "Sending reset email..."
                  : "Send password reset email"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// Protect this route as a member page
export default withAuth(AccountPage, "member");