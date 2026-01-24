'use client';
import React from 'react';
import SlideOver from '@/components/common/SlideOver';

export default function FiltersPanel({
  open, onClose,
  statusFilter, setStatusFilter,
  contractFilter, setContractFilter,
  planFilter, setPlanFilter,
  presetViews,
  savedViews,
  activeView, setActiveView,
  onOpenSaveView,
  onClearAll,
}) {
  return (
    <SlideOver open={open} onClose={onClose} title="Filters">
      <div className="space-y-3">

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-white"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
          <option value="suspended">Suspended</option>
          <option value="terminated">Terminated</option>
        </select>

        <select
          value={contractFilter}
          onChange={(e) => setContractFilter(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-white"
        >
          <option value="">All Contracts</option>
          <option value="signed">Signed</option>
          <option value="unsigned">Unsigned</option>
          <option value="na">N/A</option>
        </select>

        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-white"
        >
          <option value="">All Plans</option>
          <option value="Standard">Standard</option>
          <option value="Ultimate">Ultimate</option>
          <option value="Professional">Professional</option>
        </select>
      </div>

      <div className="mt-6 space-y-3">
        <div className="text-sm text-gray-400">Presets</div>
        <div className="flex flex-wrap gap-2">
          {presetViews.map(p => (
            <button
              key={p.name}
              className={`px-3 py-1 rounded-full border text-sm ${activeView === p.name ? 'bg-yellow-500 text-black border-yellow-400' : 'bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700'}`}
              onClick={() => setActiveView(activeView === p.name ? null : p.name)}
              title={p.name}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={activeView && !presetViews.some(p => p.name === activeView) ? activeView : ''}
            onChange={(e) => setActiveView(e.target.value || null)}
            className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-white"
          >
            <option value="">Saved Views…</option>
            {savedViews.map(v => (
              <option key={v.name} value={v.name}>{v.name}</option>
            ))}
          </select>

          <button
            className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700"
            onClick={onOpenSaveView}
            title="Save current search & filters as a view"
          >
            Save current as view
          </button>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          className="text-sm text-gray-300 hover:text-white underline"
          onClick={onClearAll}
        >
          Clear all
        </button>
        <button
          className="px-4 py-2 bg-yellow-500 text-black font-semibold rounded-md hover:bg-yellow-400"
          onClick={onClose}
        >
          Apply & Close
        </button>
      </div>
    </SlideOver>
  );
}