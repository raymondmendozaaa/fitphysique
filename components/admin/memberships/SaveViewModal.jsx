'use client';
export default function SaveViewModal({
  open,
  newViewName,
  setNewViewName,
  onCancel,
  onSave,
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-gray-800 p-6 rounded-lg w-full max-w-sm border border-gray-700 shadow-lg">
        <h3 className="text-lg font-semibold text-yellow-400 mb-4">Save Current View</h3>

        <label className="block text-sm text-gray-300 mb-1">View Name</label>
        <input
          type="text"
          value={newViewName}
          onChange={(e) => setNewViewName(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white"
          placeholder="e.g., My Prospects"
        />

        <div className="flex justify-end gap-3">
          <button className="px-4 py-2 text-sm text-gray-300 hover:text-white" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-yellow-500 text-black font-semibold rounded hover:bg-yellow-400 disabled:opacity-50"
            disabled={!newViewName.trim()}
            onClick={onSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}