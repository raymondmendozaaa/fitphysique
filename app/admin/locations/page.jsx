"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import withAuth from "@/lib/withAuth";
import AddLocationModal from "@/components/admin/locations/AddLocationModal"; // ✅ 1) IMPORT

const DEFAULTS = {
  geofence_radius_m: 30,
  cooldown_seconds: 120,
};

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const AdminLocationsPage = ({ user, role }) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const focusId = searchParams?.get("focus") || null;

  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false); // ✅ 2) STATE
  const cardRefs = useRef({});

  // ✅ 3) Extracted so we can reuse after creating a location
  const fetchLocations = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("locations")
      .select("id, name, address, city, state, zip_code, latitude, longitude, geofence_radius_m, cooldown_seconds")
      .order("name", { ascending: true });

    if (error) {
      console.error("locations SELECT error:", {
        message: error.message, details: error.details, hint: error.hint, code: error.code
      });
      setError(error.message || "Failed to fetch locations.");
    }
    setLocations(data || []);
    setLoading(false);

    // scroll focused card into view
    setTimeout(() => {
      if (focusId && cardRefs.current[focusId]) {
        cardRefs.current[focusId].scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }, 0);
  };

  useEffect(() => {
    fetchLocations();
  }, [focusId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter((l) =>
      [l.name, l.address, l.city, l.state, l.zip_code]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [locations, search]);

  async function saveLocation(locId, patch) {
    setSavingId(locId);
    setError(null);

    // optimistic update
    const prev = locations;
    const next = prev.map((l) => (l.id === locId ? { ...l, ...patch } : l));
    setLocations(next);

    const { error } = await supabase.from("locations").update(patch).eq("id", locId);

    if (error) {
      setError("Failed to update location.");
      setLocations(prev); // revert
    }

    setSavingId(null);
  }

  async function deleteLocation(id) {
    if (!confirm("Delete this location? This cannot be undone.")) return;
  
    const { error } = await supabase.from("locations").delete().eq("id", id);
    if (error) {
      alert(error.message || "Failed to delete location.");
      return;
    }
    await fetchLocations();
  }

  function LocationCard({ loc, focused, cardRefs }) {
    const [radius, setRadius] = useState(
      loc.geofence_radius_m ?? DEFAULTS.geofence_radius_m
    );
    const [cooldown, setCooldown] = useState(
      loc.cooldown_seconds ?? DEFAULTS.cooldown_seconds
    );
    const [menuOpen, setMenuOpen] = useState(false);   // NEW
    const [editOpen, setEditOpen] = useState(false);   // NEW
  
    // close dropdown on outside click
    useEffect(() => {
      function onDocClick(e) {
        if (!e.target.closest?.(`#menu-${loc.id}`)) setMenuOpen(false);
      }
      document.addEventListener("click", onDocClick);
      return () => document.removeEventListener("click", onDocClick);
    }, [loc.id]);
  
    const refSetter = (el) => {
      if (el) cardRefs.current[loc.id] = el;
    };
  
    const dirty =
      Number(radius) !== (loc.geofence_radius_m ?? DEFAULTS.geofence_radius_m) ||
      Number(cooldown) !== (loc.cooldown_seconds ?? DEFAULTS.cooldown_seconds);
  
    const disabled = savingId === loc.id;
  
    function setDefaults() {
      setRadius(DEFAULTS.geofence_radius_m);
      setCooldown(DEFAULTS.cooldown_seconds);
    }
  
    async function onSave() {
      const r = numOrNull(radius);
      const c = numOrNull(cooldown);
    
      if (!Number.isFinite(r) || r <= 0 || r > 200) {
        alert("Geofence radius must be a number between 1 and 200 meters.");
        return;
      }
      if (!Number.isFinite(c) || c < 30 || c > 3600) {
        alert("Cooldown seconds must be a number between 30 and 3600.");
        return;
      }
    
      await saveLocation(loc.id, {
        geofence_radius_m: r,
        cooldown_seconds: c,
      });
    }
  
    const cardTitle = `Geofence: ${loc.geofence_radius_m ?? DEFAULTS.geofence_radius_m}m • Cooldown: ${loc.cooldown_seconds ?? DEFAULTS.cooldown_seconds}s${
      loc.latitude != null && loc.longitude != null
        ? ` • Lat: ${loc.latitude}, Lng: ${loc.longitude}`
        : ""
    }`;
  
    return (
      <div
        ref={refSetter}
        title={cardTitle}
        className={`relative bg-gray-800 p-6 rounded-xl shadow space-y-3 border ${
          focused ? "border-yellow-400 ring-2 ring-yellow-400/40" : "border-gray-700"
        }`}
      >
        {/* top row */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-yellow-300">{loc.name}</h2>
            <span className="text-xs text-gray-400">id: {loc.id}</span>
          </div>
      
          {/* ⋯ Kebab */}
          <div id={`menu-${loc.id}`} className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              className="p-2 -mr-2 rounded-md hover:bg-gray-700 text-gray-300"
              aria-haspopup="menu"
              aria-expanded={menuOpen ? "true" : "false"}
              title="More actions"
            >
              ⋯
            </button>
            
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-44 rounded-md border border-gray-700 bg-gray-800 shadow-lg z-20"
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setEditOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700"
                >
                  Modify
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    deleteLocation(loc.id);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-red-900/30"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
          
        {/* existing content */}
        <div className="text-sm text-gray-300">
          {loc.address || loc.city || loc.state || loc.zip_code ? (
            <div>
              {loc.address && <div>{loc.address}</div>}
              <div>{[loc.city, loc.state, loc.zip_code].filter(Boolean).join(", ")}</div>
            </div>
          ) : (
            <div className="italic text-gray-500">No address on file</div>
          )}
          {loc.latitude != null && loc.longitude != null && (
            <div className="mt-1 text-yellow-400">
              Lat: {loc.latitude} • Lng: {loc.longitude}
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
          <label className="block">
            <div className="flex items-center gap-2 mb-1">
              <div className="text-sm text-gray-300">Geofence radius (meters)</div>
              <span
                className="text-xs px-1.5 py-0.5 rounded bg-gray-700 border border-gray-600 text-gray-200 cursor-help"
                title="How far from the location center a member can be and still check in. Smaller = stricter. Typical: 25–50m outdoors."
              >
                ⓘ
              </span>
            </div>
            <input
              type="number"
              min={1}
              max={200}
              step={1}
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-white"
              placeholder={`${DEFAULTS.geofence_radius_m}`}
            />
            <div className="text-xs text-gray-400 mt-1">
              Typical: 25–50m outdoors; smaller if GPS is strong.
            </div>
          </label>
        
          <label className="block">
            <div className="flex items-center gap-2 mb-1">
              <div className="text-sm text-gray-300">Cooldown (seconds)</div>
              <span
                className="text-xs px-1.5 py-0.5 rounded bg-gray-700 border border-gray-600 text-gray-200 cursor-help"
                title="Minimum time between allowed check-ins for the same user. Prevents rapid duplicates."
              >
                ⓘ
              </span>
            </div>
            <input
              type="number"
              min={30}
              max={3600}
              step={5}
              value={cooldown}
              onChange={(e) => setCooldown(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-white"
              placeholder={`${DEFAULTS.cooldown_seconds}`}
            />
            <div className="text-xs text-gray-400 mt-1">
              Prevents rapid duplicate check-ins (e.g., 120s).
            </div>
          </label>
        </div>
        
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={onSave}
            disabled={!dirty || disabled}
            className="px-4 py-2 rounded-md bg-yellow-500 text-black font-semibold disabled:opacity-50 hover:bg-yellow-400"
          >
            {disabled ? "Saving…" : "Save"}
          </button>
          <button
            onClick={setDefaults}
            disabled={disabled}
            className="px-3 py-2 rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600"
          >
            Reset to defaults
          </button>
        </div>
        
        {/* EDIT modal – reuse the same modal in edit mode */}
        <AddLocationModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          mode="edit"
          initial={loc}
          onCreated={async (updated) => {
            setEditOpen(false);
            await fetchLocations();
            if (updated?.id) {
              // focus the edited card
              const url = new URL(window.location.href);
              url.searchParams.set("focus", updated.id);
              window.history.replaceState({}, "", url.toString());
              setTimeout(() => {
                cardRefs.current[updated.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
              }, 50);
            }
          }}
        />
      </div>
    );
  }

  function clearFocus() {
    const url = new URL(window.location.href);
    url.searchParams.delete("focus");
    router.push(url.pathname + (url.searchParams.toString() ? "?" + url.searchParams.toString() : ""));
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="flex items-center gap-3 mb-3">
        <h1 className="text-3xl font-bold text-yellow-400 mr-auto">Gym Locations</h1>

        {focusId && (
          <>
            <a
              href="/admin/checkins"
              className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700"
              title="Back to Check-ins"
            >
              ← Back to Check-ins
            </a>
            <button
              onClick={clearFocus}
              className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700"
              title="Clear focus highlight"
            >
              Clear focus
            </button>
          </>
        )}

        <input
          type="text"
          placeholder="Search locations…"
          className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600"
          onClick={() => setShowAdd(true)} // ✅ 4) OPEN MODAL
        >
          ➕ Add New Location
        </button>
      </div>

      {focusId && (
        <div className="mb-5 px-3 py-2 rounded-md bg-yellow-900/30 border border-yellow-700 text-yellow-200 text-sm">
          Focused from Check-ins • Highlighting location id <span className="font-mono">{focusId}</span>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded bg-red-900/40 border border-red-700 text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p>Loading locations…</p>
      ) : filtered.length === 0 ? (
        <p>No gym locations found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtered.map((loc) => (
            <LocationCard
              key={loc.id}
              loc={loc}
              focused={focusId === String(loc.id)}
              cardRefs={cardRefs}
            />
          ))}
        </div>
      )}

      {/* ✅ 5) THE MODAL */}
      <AddLocationModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={async (loc) => {
          setShowAdd(false);
          await fetchLocations();
          if (loc?.id) router.push(`/admin/locations?focus=${loc.id}`);
        }}
      />
    </div>
  );
};

export default withAuth(AdminLocationsPage, "admin");