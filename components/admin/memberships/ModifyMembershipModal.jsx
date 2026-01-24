'use client';
export default function ModifyMembershipModal({
  open,
  cancelAction, setCancelAction,
  cancelReason, setCancelReason,
  suspendedUntil, setSuspendedUntil,
  onCancel,
  onApply,
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-gray-800 p-6 rounded-lg w-full max-w-md border border-gray-700 shadow-lg relative">
        <h2 className="text-xl font-bold mb-4 text-yellow-400">Modify Membership</h2>

        <label className="block text-sm text-gray-300 mb-1">Action</label>
        <select
          value={cancelAction}
          onChange={(e) => setCancelAction(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white"
        >
          <option value="">Select an action</option>
          <option value="cancel">Cancel (Graceful)</option>
          <option value="suspend">Suspend (Temporary)</option>
          <option value="terminate">Terminate (Permanent)</option>
        </select>

        {(cancelAction === 'cancel' || cancelAction === 'terminate') && (
          <>
            <label className="block text-sm text-gray-300 mb-1">Reason</label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full mb-4 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white resize-none"
              rows={3}
              placeholder="Enter reason for this action..."
            />
          </>
        )}

        {cancelAction === 'suspend' && (
          <>
            <label className="block text-sm text-gray-300 mb-1">Suspended Until</label>
            <input
              type="date"
              value={suspendedUntil}
              onChange={(e) => setSuspendedUntil(e.target.value)}
              className="w-full mb-4 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white"
            />
          </>
        )}

        <div className="flex justify-end gap-3">
          <button className="px-4 py-2 text-sm text-gray-300 hover:text-white" onClick={onCancel}>
            Cancel
          </button>
          <button
            onClick={onApply}
            className="px-4 py-2 bg-yellow-500 text-black font-semibold rounded hover:bg-yellow-400"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}