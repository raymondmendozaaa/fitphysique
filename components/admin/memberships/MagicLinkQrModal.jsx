'use client';
export default function MagicLinkQrModal({ open, qrLink, onClose }) {
  if (!open || !qrLink) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 w-[360px]">
        <h3 className="text-lg font-semibold text-yellow-400 mb-4">Scan to Sign In</h3>
        <div className="flex justify-center mb-2">
          <img alt="Magic Link QR" className="bg-white p-2 rounded" src={qrLink} />
        </div>
        <div className="flex justify-end">
          <button className="px-3 py-2 text-sm text-gray-300 hover:text-white" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}