"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { showError, showSuccess } from "@/lib/utils/toastUtils";

export default function AddLocationModal({
  open,
  onClose,
  onCreated,
  mode = "create",
  initial = null,
}) {
  const isEdit = mode === "edit";

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState("");
  const [zip, setZip] = useState("");
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [geofenceRadius, setGeofenceRadius] = useState(30);
  const [cooldownSeconds, setCooldownSeconds] = useState(120);
  const [maxAccuracyMeters, setMaxAccuracyMeters] = useState(15);
  const [conservativeGeofence, setConservativeGeofence] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [saving, setSaving] = useState(false);

  // Prefill when opening (especially for edit)
  useEffect(() => {
    if (!open) return;
    setName(initial?.name || "");
    setAddress(initial?.address || "");
    setCity(initial?.city || "");
    setStateVal(initial?.state || "");
    setZip(initial?.zip_code || "");
    setLat(initial?.latitude ?? null);
    setLng(initial?.longitude ?? null);
    setGeofenceRadius(initial?.geofence_radius_m ?? 30);
    setCooldownSeconds(initial?.cooldown_seconds ?? 120);
    setMaxAccuracyMeters(initial?.max_accuracy_meters ?? 15);
    setConservativeGeofence(initial?.conservative_geofence ?? false);
    setGeocoding(false);
    setSaving(false);
  }, [open, initial]);

  const fullAddress = useMemo(() => {
    const parts = [address, city, stateVal, zip].filter(Boolean);
    return parts.join(", ");
  }, [address, city, stateVal, zip]);

  async function geocode() {
    if (!fullAddress) {
      showError("Enter an address to preview on the map.");
      return;
    }
    setGeocoding(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=1`;
      const res = await fetch(url, { headers: { "Accept-Language": "en" } });

      if (!res.ok) {
        if (res.status === 429) {
          showError("Geocoding rate limit hit. Try again in a moment.");
        } else {
          showError(`Geocoding failed (${res.status}). You can still save without coordinates.`);
        }
        return;
      }

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        showError("Address not found. You can still save without coordinates.");
        setLat(null); setLng(null);
        return;
      }
      const best = data[0];
      setLat(parseFloat(best.lat));
      setLng(parseFloat(best.lon));
    } catch (e) {
      console.error(e);
      showError("Geocoding failed. You can still save without coordinates.");
    } finally {
      setGeocoding(false);
    }
  }

  async function save() {
    const trimmedName = (name || "").trim();
    const trimmedAddress = (address || "").trim();
    const trimmedCity = (city || "").trim();
    const stateCode = (stateVal || "").trim().toUpperCase(); // ✅ use stateVal
    const trimmedZip = (zip || "").trim();

    if (!trimmedName || !trimmedAddress) {
      showError("Name and address are required.");
      return;
    }
    if (stateCode && !/^[A-Z]{2}$/.test(stateCode)) {
      showError("State must be a 2-letter code (e.g., TX).");
      return;
    }
    if (trimmedZip && !/^\d{5}(-\d{4})?$/.test(trimmedZip)) {
      showError("ZIP must be 5 digits (optionally ZIP+4).");
      return;
    }
    if (lat != null && (lat < -90 || lat > 90)) {
      showError("Latitude must be between -90 and 90.");
      return;
    }
    if (lng != null && (lng < -180 || lng > 180)) {
      showError("Longitude must be between -180 and 180.");
      return;
    }

    const radiusNum = Number(geofenceRadius);
    const cooldownNum = Number(cooldownSeconds);
    const maxAccuracyNum = Number(maxAccuracyMeters);

    if (!Number.isFinite(radiusNum) || radiusNum <= 0 || radiusNum > 500) {
      showError("Geofence radius must be between 1 and 500 meters.");
      return;
    }

    if (!Number.isFinite(cooldownNum) || cooldownNum < 0 || cooldownNum > 86400) {
      showError("Cooldown must be between 0 and 86400 seconds.");
      return;
    }

    if (!Number.isFinite(maxAccuracyNum) || maxAccuracyNum <= 0 || maxAccuracyNum > 200) {
      showError("Max accuracy must be between 1 and 200 meters.");
      return;
    }

    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token = session?.access_token;
      if (!token) {
        showError("Missing admin session. Please log in again.");
        setSaving(false);
        return;
      }

      const url = isEdit
        ? `/api/admin/locations/${initial?.id}`
        : "/api/admin/locations/create";

      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: trimmedName,
          address: trimmedAddress,
          city: trimmedCity,
          state: stateCode,
          zip_code: trimmedZip,
          latitude: lat,
          longitude: lng,
          geofence_radius_m: radiusNum,
          cooldown_seconds: cooldownNum,
          max_accuracy_meters: maxAccuracyNum,
          conservative_geofence: !!conservativeGeofence,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data?.message || (isEdit ? "Failed to update location." : "Failed to create location."));
        return;
      }
      showSuccess(isEdit ? "Location updated." : "Location created.");
      onCreated?.(data.location);

      // reset and close
      setName("");
      setAddress("");
      setCity("");
      setStateVal("");
      setZip("");
      setLat(null);
      setLng(null);
      setGeofenceRadius(30);
      setCooldownSeconds(120);
      setMaxAccuracyMeters(15);
      setConservativeGeofence(false);
      onClose?.();
    } catch (e) {
      console.error(e);
      showError("Unexpected error while saving.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const mapIframe =
    lat != null && lng != null
      ? `https://www.openstreetmap.org/export/embed.html?layer=mapnik&marker=${lat}%2C${lng}&bbox=${lng-0.01}%2C${lat-0.01}%2C${lng+0.01}%2C${lat+0.01}`
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-2xl rounded-xl border border-gray-700 bg-gray-900 p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">
            {isEdit ? "Modify Location" : "Add New Location"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md border border-gray-700 px-2 py-1 hover:bg-gray-800"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-sm mb-1">Name *</label>
            <input
              className="w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2"
              value={name}
              onChange={(e)=>setName(e.target.value)}
              placeholder="Downtown Gym"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Address *</label>
            <input
              className="w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2"
              value={address}
              onChange={(e)=>setAddress(e.target.value)}
              placeholder="123 Main St"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm mb-1">City</label>
              <input
                className="w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2"
                value={city}
                onChange={(e)=>setCity(e.target.value)}
                placeholder="Austin"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">State</label>
              <input
                className="w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2"
                value={stateVal}
                onChange={(e)=>setStateVal(e.target.value)}
                placeholder="TX"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Zip</label>
              <input
                className="w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2"
                value={zip}
                onChange={(e)=>setZip(e.target.value)}
                placeholder="78701"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={geocode}
              disabled={geocoding || !fullAddress}
              className="rounded-md bg-gray-700 hover:bg-gray-600 px-3 py-2 disabled:opacity-50"
            >
              {geocoding ? "Locating…" : "Preview on Map"}
            </button>
            {(lat != null && lng != null) && (
              <span className="text-sm text-gray-300">
                {lat?.toFixed?.(6)}, {lng?.toFixed?.(6)}
              </span>
            )}
          </div>

          {mapIframe && (
            <div className="mt-2 rounded-lg overflow-hidden border border-gray-700">
              <iframe
                title="map-preview"
                width="100%"
                height="260"
                loading="lazy"
                src={mapIframe}
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
            <div>
              <label className="block text-sm mb-1">Geofence Radius (m)</label>
              <input
                type="number"
                min="1"
                max="500"
                className="w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2"
                value={geofenceRadius}
                onChange={(e) => setGeofenceRadius(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm mb-1">Cooldown (seconds)</label>
              <input
                type="number"
                min="0"
                max="86400"
                className="w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2"
                value={cooldownSeconds}
                onChange={(e) => setCooldownSeconds(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm mb-1">Max Accuracy (m)</label>
              <input
                type="number"
                min="1"
                max="200"
                className="w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2"
                value={maxAccuracyMeters}
                onChange={(e) => setMaxAccuracyMeters(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 mt-3 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={conservativeGeofence}
              onChange={(e) => setConservativeGeofence(e.target.checked)}
            />
            Conservative geofence
          </label>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-gray-700 px-3 py-2 hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !name || !address}
              className="rounded-md bg-yellow-500 text-black font-semibold px-4 py-2 hover:bg-yellow-400 disabled:opacity-50"
            >
              {saving ? (isEdit ? "Saving…" : "Saving…") : (isEdit ? "Save Changes" : "Save Location")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}