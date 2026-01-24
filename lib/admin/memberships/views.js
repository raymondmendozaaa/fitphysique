export const presetViews = [
  { name: 'Needs Contract', apply: (m) => m.requires_contract && m.needs_contract },
  {
    name: 'Renewals this week',
    apply: (m) => {
      if (!m.next_payment_date) return false;
      const d = new Date(m.next_payment_date);
      const today = new Date();
      const in7 = new Date(); in7.setDate(today.getDate() + 7);
      return d >= new Date(today.toDateString()) && d <= in7;
    },
  },
  { name: 'Dunning (failed/ retrying)', apply: (m) => (m.last_payment_status === 'failed') || !!m.renewal_pending },
];