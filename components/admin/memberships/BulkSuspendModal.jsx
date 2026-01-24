'use client';
export default function BulkSuspendModal({
  open,
  bulkSuspendUntil, setBulkSuspendUntil,
  bulkSuspendReason, setBulkSuspendReason,
  selectedCount,
  onCancel,
  onApply,
  canApply,
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div className="bg-gray-800 p-6 rounded-lg w-full max-w-md border border-gray-700 shadow-lg">
        <h3 className="text-lg font-semibold text-yellow-400 mb-4">Suspend Selected Memberships</h3>

        <label className="block text-sm text-gray-300 mb-1">Suspend until</label>
        <input
          type="date"
          value={bulkSuspendUntil}
          onChange={(e) => setBulkSuspendUntil(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white"
        />

        <label className="block text-sm text-gray-300 mb-1">Reason (optional)</label>
        <textarea
          value={bulkSuspendReason}
          onChange={(e) => setBulkSuspendReason(e.target.value)}
          rows={3}
          className="w-full mb-4 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white resize-none"
          placeholder="e.g., Building maintenance 12/1–12/15"
        />

        <div className="flex justify-end gap-3">
          <button className="px-4 py-2 text-sm text-gray-300 hover:text-white" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-yellow-500 text-black font-semibold rounded hover:bg-yellow-400 disabled:opacity-50"
            onClick={onApply}
            disabled={!canApply}
            title={!canApply ? 'Choose a date or select rows' : undefined}
          >
            Apply to {selectedCount} selected
          </button>
        </div>
      </div>
    </div>
  );
}