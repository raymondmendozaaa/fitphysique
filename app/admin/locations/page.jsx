"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import withAuth from "@/lib/withAuth";

const AdminLocationsPage = ({ user, role }) => {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLocations = async () => {
      const { data, error } = await supabase.from("locations").select("*");
      if (error) {
        console.error("❌ Failed to fetch locations:", error);
      } else {
        setLocations(data);
      }
      setLoading(false);
    };

    fetchLocations();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-4">Gym Locations</h1>

      <button
        className="mb-6 px-6 py-2 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded"
        onClick={() => alert("Add location functionality coming soon!")}
      >
        ➕ Add New Location
      </button>

      {loading ? (
        <p>Loading locations...</p>
      ) : locations.length === 0 ? (
        <p>No gym locations found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {locations.map((location) => (
            <div
              key={location.id}
              className="bg-gray-800 p-6 rounded-xl shadow space-y-1"
            >
              <h2 className="text-xl font-semibold">{location.name}</h2>
              <p>{location.address}</p>
              <p>
                {location.city}, {location.state} {location.zipcode}
              </p>
              {location.latitude && location.longitude && (
                <p className="text-sm text-yellow-400">
                  Lat: {location.latitude}, Lng: {location.longitude}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default withAuth(AdminLocationsPage, "admin");