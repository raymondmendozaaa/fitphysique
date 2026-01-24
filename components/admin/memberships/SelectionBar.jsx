'use client';
import React from 'react';

export default function SelectionBar({
  countSelected,
  pageAllSelected,
  idsOnPage,
  onTogglePage,
  onSelectAllInView,
  onExportSelected,
  onEmailLoginsSelected,
  onEnableAutorenewSelected,
  onOpenBulkSuspend,
  onClearSelection,
}) {
  return (
    <div className="mb-3 sticky top-0 z-10 bg-gray-800/95 backdrop-blur border border-gray-700 rounded-lg p-3 flex items-center gap-2">
      <div className="text-sm text-gray-200">
        <strong>{countSelected}</strong> selected
      </div>

      <button
        className="px-3 py-1 rounded bg-gray-700 border border-gray-600 text-gray-100 hover:bg-gray-600"
        onClick={onTogglePage}
        title={pageAllSelected ? 'Unselect page' : 'Select page'}
      >
        {pageAllSelected ? 'Unselect page' : 'Select page'}
      </button>

      <button
        className="px-3 py-1 rounded bg-gray-700 border border-gray-600 text-gray-100 hover:bg-gray-600"
        onClick={onSelectAllInView}
        title="Select all in view"
      >
        Select all in view
      </button>

      <button
        className="px-3 py-1 rounded bg-gray-700 border border-gray-600 text-gray-100 hover:bg-gray-600"
        onClick={onExportSelected}
      >
        Export selected CSV
      </button>

      <button
        className="px-3 py-1 rounded bg-gray-700 border border-gray-600 text-gray-100 hover:bg-gray-600"
        onClick={onEmailLoginsSelected}
      >
        Email login links
      </button>

      <button
        className="px-3 py-1 rounded bg-gray-700 border border-gray-600 text-gray-100 hover:bg-gray-600"
        onClick={onEnableAutorenewSelected}
      >
        Enable auto-renew
      </button>

      <button
        className="px-3 py-1 rounded bg-yellow-500 text-black hover:bg-yellow-400"
        onClick={onOpenBulkSuspend}
        title="Suspend selected memberships until a chosen date"
      >
        Suspend until…
      </button>

      <button
        className="ml-auto px-3 py-1 rounded bg-gray-200 text-black hover:bg-white"
        onClick={onClearSelection}
      >
        Clear selection
      </button>
    </div>
  );
}