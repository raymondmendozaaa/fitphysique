'use client';
export default function EditContactModal({
  open,
  editFullName, setEditFullName,
  editEmail, setEditEmail,
  editPhone, setEditPhone,
  editSmsOptIn, setEditSmsOptIn,
  editReason, setEditReason,
  willEmailChange,
  onCancel,
  onSave,
  disableSave,
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div className="bg-gray-800 p-6 rounded-lg w-full max-w-md border border-gray-700 shadow-lg">
        <h3 className="text-lg font-semibold text-yellow-400 mb-4">Edit Contact</h3>

        <label className="block text-sm text-gray-300 mb-1">Full Name</label>
        <input
          type="text"
          value={editFullName}
          onChange={(e) => setEditFullName(e.target.value)}
          className="w-full mb-3 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white"
          placeholder="Full name"
        />

        <label className="block text-sm text-gray-300 mb-1">Email</label>
        <input
          type="email"
          value={editEmail}
          onChange={(e) => setEditEmail(e.target.value)}
          className="w-full mb-3 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white"
          placeholder="name@example.com"
        />

        <label className="block text-sm text-gray-300 mb-1">Phone</label>
        <input
          type="tel"
          value={editPhone}
          onChange={(e) => setEditPhone(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white"
          placeholder="+1 555 123 4567"
        />

        <label className="inline-flex items-center gap-2 text-sm text-gray-300 mb-4">
          <input
            type="checkbox"
            checked={editSmsOptIn}
            onChange={(e) => setEditSmsOptIn(e.target.checked)}
            className="h-4 w-4"
          />
          SMS opt-in (OK to text this number)
        </label>

        <label className="block text-sm text-gray-300 mb-1">Reason (required if email changes)</label>
        <input
          type="text"
          value={editReason}
          onChange={(e) => setEditReason(e.target.value)}
          className={`w-full mb-4 px-3 py-2 rounded-md bg-gray-700 border text-white
            ${willEmailChange && !editReason?.trim() ? 'border-yellow-500' : 'border-gray-600'}`}
          placeholder="Member requested change at front desk…"
        />

        {willEmailChange && !editReason?.trim() && (
          <p className="text-xs text-yellow-400 -mt-2 mb-2">
            Please provide a short reason for changing this member’s email.
          </p>
        )}

        <div className="flex justify-end gap-3">
          <button className="px-4 py-2 text-sm text-gray-300 hover:text-white" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-yellow-500 text-black font-semibold rounded hover:bg-yellow-400 disabled:opacity-50"
            onClick={onSave}
            disabled={disableSave}
            title={disableSave ? 'Fill required fields' : undefined}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}