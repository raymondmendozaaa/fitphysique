'use client';
import React from 'react';
import SlideOver from '@/components/common/SlideOver';

export default function CreateMembershipSlideOver({
  open, onClose,

  availableUsers, planGroups,

  createUserId, setCreateUserId,
  pendingNewUser, setPendingNewUser,

  paymentMode, setPaymentMode,
  checkoutBehavior, setCheckoutBehavior,

  createPlan, setCreatePlan,
  createDurationId, setCreateDurationId,
  createStartDate, setCreateStartDate,

  createAutoRenewalEnabled, setCreateAutoRenewalEnabled,
  createRenewAtDiscountedRate, setCreateRenewAtDiscountedRate,

  offlineMethod, setOfflineMethod,
  offlineAmount, setOfflineAmount,
  offlineNotes, setOfflineNotes,

  // mini “new user” modal
  showUserCreateModal, setShowUserCreateModal,
  newFullName, setNewFullName,
  newEmail, setNewEmail,
  newPhone, setNewPhone,
  newSmsOptIn, setNewSmsOptIn,

  isPaidInFullSelected,
  hasMember,

  onStartCheckout,
  onCreateOffline,
}) {
  return (
    <>
      <SlideOver open={open} onClose={onClose} title="Create Membership">
        {/* Member */}
        <label className="block text-sm text-gray-300 mb-1">Member</label>
        <select
          value={createUserId}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "__new__") {
              setPendingNewUser(null);
              setNewFullName("");
              setNewEmail("");
              setShowUserCreateModal(true);
              setCreateUserId("__new__");
            } else {
              setCreateUserId(val);
              setPendingNewUser(null);
              setNewFullName("");
              setNewEmail("");
            }
          }}
          className="w-full mb-4 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white"
        >
          <option value="">Select a user</option>
          {createUserId === "__new__" && pendingNewUser && (
            <option value="__new__">
              ➕ New: {pendingNewUser.full_name || "New Member"} ({pendingNewUser.email})
            </option>
          )}
          {availableUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name} ({u.email})
            </option>
          ))}
          <option value="__new__">➕ Create New User</option>
        </select>

        {createUserId === "__new__" && pendingNewUser && (
          <p className="text-sm text-gray-400 -mt-2 mb-2">
            New user draft: <span className="text-gray-200">{pendingNewUser.full_name || "New Member"}</span> ({pendingNewUser.email})
          </p>
        )}

        {/* Auto-renew / Discount */}
        <div className="mb-4 space-y-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={createAutoRenewalEnabled}
              onChange={(e) => setCreateAutoRenewalEnabled(e.target.checked)}
            />
            <span>Enable Auto-renew</span>
          </label>

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={createRenewAtDiscountedRate}
              onChange={(e) => setCreateRenewAtDiscountedRate(e.target.checked)}
              disabled={!isPaidInFullSelected || !createAutoRenewalEnabled}
            />
            <span>
              Renew at discounted rate
              {!isPaidInFullSelected ? " (Paid-in-Full only)" : !createAutoRenewalEnabled ? " (Auto-renew must be on)" : ""}
            </span>
          </label>
        </div>

        {/* Plan */}
        <label className="block text-sm text-gray-300 mb-1">Plan</label>
        <select
          value={createPlan}
          onChange={(e) => {
            setCreatePlan(e.target.value);
            setCreateDurationId('');
          }}
          className="w-full mb-4 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white"
        >
          <option value="">Select a plan</option>
          {Object.keys(planGroups).map((plan) => (
            <option key={plan} value={plan}>
              {plan}
            </option>
          ))}
        </select>

        {/* Duration */}
        {createPlan && (
          <>
            <label className="block text-sm text-gray-300 mb-1">Duration</label>
            <select
              value={createDurationId}
              onChange={(e) => setCreateDurationId(e.target.value)}
              className="w-full mb-4 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white"
            >
              <option value="">Select duration</option>
              {planGroups[createPlan]?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.duration_label}
                </option>
              ))}
            </select>
          </>
        )}

        {/* Payment Method */}
        <label className="block text-sm text-gray-300 mb-1">Payment Method</label>
        <select
          value={paymentMode}
          onChange={(e) => setPaymentMode(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white"
        >
          <option value="checkout">Stripe Checkout</option>
          <option value="comped">Offline (Cash / Check / Comp)</option>
        </select>

        {/* Checkout Behavior */}
        {paymentMode === 'checkout' && (
          <>
            <label className="block text-sm text-gray-300 mb-1">Checkout Behavior</label>
            <select
              value={checkoutBehavior}
              onChange={(e) => setCheckoutBehavior(e.target.value)}
              className="w-full mb-4 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white"
            >
              <option value="bill_today_start_today">Bill today, start today</option>
              <option value="bill_today_start_later">Bill today, start on chosen date</option>
              <option value="bill_at_start_date">Bill at chosen date (trial until then)</option>
            </select>

            {(checkoutBehavior === 'bill_today_start_later' || checkoutBehavior === 'bill_at_start_date') && (
              <>
                <label className="block text-sm text-gray-300 mb-1 mt-1">Start Date</label>
                <input
                  type="date"
                  value={createStartDate}
                  onChange={(e) => setCreateStartDate(e.target.value)}
                  className="w-full mb-4 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white"
                />
              </>
            )}
          </>
        )}

        {/* Start Date for comped */}
        {paymentMode === 'comped' && (
          <>
            <label className="block text-sm text-gray-300 mb-1 mt-1">Start Date</label>
            <input
              type="date"
              value={createStartDate}
              onChange={(e) => setCreateStartDate(e.target.value)}
              className="w-full mb-4 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white"
            />
          </>
        )}

        {/* Offline fields */}
        {paymentMode === 'comped' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Offline Method</label>
                <select
                  value={offlineMethod}
                  onChange={(e) => setOfflineMethod(e.target.value)}
                  className="w-full mb-4 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white"
                >
                  <option value="cash">Cash</option>
                  <option value="check">Check</option>
                  <option value="comp">Comp</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={offlineMethod === 'comp' ? 0 : offlineAmount}
                  onChange={(e) => setOfflineAmount(e.target.value)}
                  disabled={offlineMethod === 'comp'}
                  className="w-full mb-4 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white"
                />
              </div>
            </div>

            <label className="block text-sm text-gray-300 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={offlineNotes}
              onChange={(e) => setOfflineNotes(e.target.value)}
              placeholder="front desk / receipt #123"
              className="w-full mb-4 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white"
            />
          </>
        )}

        {/* Footer buttons */}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:text-white">
            Cancel
          </button>

          <button
            className="px-4 py-2 bg-blue-500 text-black font-semibold rounded hover:bg-blue-400 disabled:opacity-50"
            disabled={
              !hasMember ||
              !createDurationId ||
              paymentMode !== 'checkout' ||
              ((checkoutBehavior === 'bill_today_start_later' || checkoutBehavior === 'bill_at_start_date') && !createStartDate)
            }
            onClick={onStartCheckout}
          >
            Start Checkout
          </button>

          <button
            className="px-4 py-2 bg-yellow-500 text-black font-semibold rounded hover:bg-yellow-400 disabled:opacity-50"
            disabled={
              !hasMember ||
              !createDurationId ||
              paymentMode !== 'comped' ||
              (offlineMethod !== 'comp' && !(Number(offlineAmount) > 0))
            }
            onClick={onCreateOffline}
          >
            Create Offline
          </button>
        </div>
      </SlideOver>

      {/* Your existing mini “Create New User” modal */}
      {showUserCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-gray-800 p-6 rounded-lg w-full max-w-md border border-gray-700 shadow-lg">
            <h3 className="text-lg font-semibold text-yellow-400 mb-4">Create New User</h3>

            <label className="block text-sm text-gray-300 mb-1">Full Name (optional)</label>
            <input
              type="text"
              value={newFullName}
              onChange={(e) => setNewFullName(e.target.value)}
              className="w-full mb-3 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white"
              placeholder="Jane Doe"
            />

            <label className="block text-sm text-gray-300 mb-1">Email</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full mb-4 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white"
              placeholder="jane@example.com"
            />

            <label className="block text-sm text-gray-300 mb-1">Phone (optional)</label>
            <input
              type="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="w-full mb-4 px-3 py-2 rounded-md bg-gray-700 border border-gray-600 text-white"
              placeholder="+1 555 123 4567"
            />

            <label className="inline-flex items-center gap-2 text-sm text-gray-300 mb-4">
              <input
                type="checkbox"
                checked={newSmsOptIn}
                onChange={(e) => setNewSmsOptIn(e.target.checked)}
                className="h-4 w-4"
              />
              SMS opt-in (OK to text this number)
            </label>

            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 text-sm text-gray-300 hover:text-white"
                onClick={() => {
                  setShowUserCreateModal(false);
                  setNewFullName("");
                  setNewEmail("");
                  setPendingNewUser(null);
                  setCreateUserId('');
                }}
              >
                Cancel
              </button>

                <button
                  className="px-4 py-2 bg-yellow-500 text-black font-semibold rounded hover:bg-yellow-400"
                  onClick={() => {
                    if (!newEmail) {
                      alert("Email is required");
                      return;
                    }
                    setPendingNewUser({
                      full_name: newFullName || null,
                      email: newEmail, 
                      phone: newPhone || null,
                      sms_opt_in: !!newSmsOptIn,
                    });
                    setCreateUserId('__new__');
                    setShowUserCreateModal(false);
                  }}
                >
                  Save
                </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}