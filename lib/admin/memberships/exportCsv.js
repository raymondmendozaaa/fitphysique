// lib/admin/memberships/exportCsv.js
import { toAdminDateInputValue, getTodayDateInputValue } from "@/lib/utils/dateTime";

export function exportCsv(rows, activeViewLabel = "current-filter") {
  const cols = [
    "full_name",
    "email",
    "status",
    "plan_name",
    "duration_label",
    "requires_contract",
    "needs_contract",
    "auto_renewal_enabled",
    "paid_in_full",
    "renew_at_discounted_rate",
    "start_date",
    "expires_at",
    "grace_ends_at",
    "next_payment_date",
    "last_payment_status",
    "last_payment_date",
  ];

  const dateCols = new Set([
    "start_date",
    "expires_at",
    "grace_ends_at",
    "next_payment_date",
    "last_payment_date",
  ]);

  const header = cols.join(",");

  const escape = (v) => {
    if (v === null || v === undefined) return "";

    const s = String(v);

    if (/[",\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }

    return s;
  };

  const body = rows
    .map((row) =>
      cols
        .map((col) => {
          let val = row[col];

          if (dateCols.has(col)) {
            val = val ? toAdminDateInputValue(val) : "";
          }

          if (typeof val === "boolean") {
            val = val ? "true" : "false";
          }

          return escape(val);
        })
        .join(",")
    )
    .join("\n");

  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const safeViewLabel = String(activeViewLabel || "current-filter")
    .trim()
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  const stamp = getTodayDateInputValue();

  const a = document.createElement("a");
  a.href = url;
  a.download = `memberships-${safeViewLabel || "current-filter"}-${stamp}.csv`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}