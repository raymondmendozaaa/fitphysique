import {
  getTodayDateInputValue,
  addDaysToDateInput,
  getDateInputFromValue,
} from "@/lib/utils/dateTime";

export const presetViews = [
  {
    name: "Needs Contract",
    apply: (m) => m.requires_contract && m.needs_contract,
  },
  {
    name: "Renewals this week",
    apply: (m) => {
      if (!m.next_payment_date) return false;

      const today = getTodayDateInputValue();
      const in7 = addDaysToDateInput(today, 7);
      const paymentDate = getDateInputFromValue(m.next_payment_date);

      if (!paymentDate) return false;

      return paymentDate >= today && paymentDate <= in7;
    },
  },
  {
    name: "Dunning (failed/ retrying)",
    apply: (m) =>
      m.last_payment_status === "failed" || !!m.renewal_pending,
  },
];