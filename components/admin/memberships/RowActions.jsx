'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy } from '@fortawesome/free-solid-svg-icons';

function RowWithCopy({ label, toneClass, userId, purpose, onEmail, onPrewarm, onCopy, copiedKey }) {
  const key = `${userId}:${purpose}`;
  const isCopied = copiedKey === key;

  return (
    <div className="relative group">
      <button
        type="button"
        className={`block w-full text-left px-3 pr-9 py-2 text-sm ${toneClass} hover:bg-gray-700`}
        onClick={(e) => { e.stopPropagation(); onEmail(); }}
        title={label}
      >
        {label}
      </button>

      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded 
                   opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity focus:outline-none"
        onMouseEnter={onPrewarm}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCopy(); }}
        aria-label={`Copy ${label}`}
        title={isCopied ? 'Copied!' : `Copy ${label}`}
      >
        <FontAwesomeIcon
          icon={faCopy}
          className={`h-4 w-4 transition-colors duration-100 ${isCopied ? 'text-blue-400' : 'text-gray-300'}`}
        />
      </button>
    </div>
  );
}

export default function RowActions({
  m,
  isExpanded,
  onToggleDetails,
  // actions from parent
  openEditContact,
  setSelectedMember,
  setShowCancelModal,
  toggleAutoRenew,
  sendLink,
  getMagicLinkCached,
  copyLinkOnly,
  showQrForUser,
  smsMagicLink,
  // tiny bits of local UI state
  copiedKey,
  setCopiedKey,
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (!open) return;
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    function onEsc(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="inline-flex items-center gap-2 relative" ref={menuRef}>
      <button
        onClick={onToggleDetails}
        className="text-blue-400 hover:underline"
        title={isExpanded ? 'Hide details' : 'Show details'}
      >
        {isExpanded ? 'Hide' : 'Details'}
      </button>

      <button
        className="h-8 w-8 rounded-full bg-gray-700 border border-gray-600 text-gray-100 hover:bg-gray-600"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        title="More actions"
      >
        ⋯
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-56 rounded-md bg-gray-800 border border-gray-700 shadow-lg z-20 divide-y divide-gray-700"
          onMouseLeave={() => setOpen(false)}
        >
          <button
            type="button"
            className="block w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-50"
            onClick={() => { setOpen(false); openEditContact({
              id: m.user_id, full_name: m.full_name, email: m.email, phone: m.phone, sms_opt_in: m.sms_opt_in
            }); }}
            disabled={!m.user_id}
          >
            Edit contact
          </button>

          <button
            type="button"
            className="block w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700"
            onClick={() => { setOpen(false); setSelectedMember(m); setShowCancelModal(true); }}
          >
            Modify status
          </button>

          <button
            type="button"
            className="block w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700"
            onClick={async () => { setOpen(false); await toggleAutoRenew(m); }}
          >
            {m.auto_renewal_enabled ? 'Disable auto-renew' : 'Enable auto-renew'}
          </button>

          {m.user_id && (
            <div className="py-1">
              {!m.onboarded && (
                <RowWithCopy
                  label="Invite link (signup)"
                  toneClass="text-yellow-400"
                  userId={m.user_id}
                  purpose="signup"
                  onEmail={() => { setOpen(false); sendLink(m.user_id, 'signup', 'email'); }}
                  onPrewarm={() => { getMagicLinkCached(m.user_id, 'signup').catch(() => {}); }}
                  onCopy={() => { copyLinkOnly(m.user_id, 'signup'); }}
                  copiedKey={copiedKey}
                />
              )}
              <RowWithCopy
                label="Magic link (login)"
                toneClass="text-blue-400"
                userId={m.user_id}
                purpose="login"
                onEmail={() => { setOpen(false); sendLink(m.user_id, 'login', 'email'); }}
                onPrewarm={() => { getMagicLinkCached(m.user_id, 'login').catch(() => {}); }}
                onCopy={() => { copyLinkOnly(m.user_id, 'login'); }}
                copiedKey={copiedKey}
              />
              <button
                type="button"
                className="block w-full text-left px-3 py-2 text-sm text-indigo-400 hover:bg-gray-700"
                onClick={() => { setOpen(false); showQrForUser(m.user_id); }}
              >
                Show QR (login)
              </button>
              <RowWithCopy
                label="Recovery link"
                toneClass="text-indigo-400"
                userId={m.user_id}
                purpose="recovery"
                onEmail={() => { setOpen(false); sendLink(m.user_id, 'recovery', 'email'); }}
                onPrewarm={() => { getMagicLinkCached(m.user_id, 'recovery').catch(() => {}); }}
                onCopy={() => { copyLinkOnly(m.user_id, 'recovery'); }}
                copiedKey={copiedKey}
              />
            </div>
          )}

          {m.phone && (
            <button
              type="button"
              className="block w-full text-left px-3 py-2 text-sm text-sky-400 hover:bg-gray-700"
              onClick={() => {
                setOpen(false);
                smsMagicLink({ user: { id: m.user_id, phone: m.phone, sms_opt_in: m.sms_opt_in } });
              }}
            >
              SMS magic link
            </button>
          )}
        </div>
      )}
    </div>
  );
}