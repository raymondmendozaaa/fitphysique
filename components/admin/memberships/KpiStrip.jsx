"use client";
import React from 'react';

export default function KpiStrip({ kpis = [] }) {
  if (!kpis?.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
      {kpis.map(({ label, value }) => (
        <div key={label} className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-400">{label}</div>
          <div className="text-xl font-semibold text-yellow-400 mt-1">{value}</div>
        </div>
      ))}
    </div>
  );
}