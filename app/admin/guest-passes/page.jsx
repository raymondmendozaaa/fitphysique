'use client';

import { useState } from "react";

const GuestPassesPage = () => {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="ml-64 p-8 pt-40 min-h-screen bg-gray-900 text-white">
      <h1 className="text-3xl font-bold mb-4 text-yellow-400">Manage Guest Passes</h1>

      {/* Filter + Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        {/* Search Input */}
        <input
          type="text"
          placeholder="Search by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full sm:w-1/2 px-4 py-2 rounded-md bg-gray-800 border border-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />

        {/* Issue Guest Pass Button */}
        <button className="px-4 py-2 bg-yellow-500 text-black font-semibold rounded-md hover:bg-yellow-400 transition-all">
          🎫 Issue Guest Pass
        </button>
      </div>

      {/* Guest Pass Table */}
      <div className="overflow-x-auto bg-gray-800 rounded-lg shadow border border-gray-700">
        <table className="min-w-full table-auto text-left">
          <thead className="bg-gray-700 text-gray-300">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Issued</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Promo</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {/* Placeholder row */}
            <tr>
              <td className="px-4 py-3">Jane Smith</td>
              <td className="px-4 py-3">jane@example.com</td>
              <td className="px-4 py-3">2025-07-10</td>
              <td className="px-4 py-3">2025-07-11</td>
              <td className="px-4 py-3">Pampa Gym</td>
              <td className="px-4 py-3 text-green-400 font-semibold">Yes</td>
              <td className="px-4 py-3 text-center space-x-2">
                <button className="text-yellow-400 hover:underline">Edit</button>
                <button className="text-red-400 hover:underline">Revoke</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default GuestPassesPage;