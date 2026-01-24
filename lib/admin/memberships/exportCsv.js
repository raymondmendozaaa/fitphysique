export function exportCsv(rows, activeViewLabel = 'current-filter') {
  const cols = [
    'full_name','email','status','plan_name','duration_label',
    'requires_contract','needs_contract','auto_renewal_enabled',
    'paid_in_full','renew_at_discounted_rate','start_date','expires_at',
    'next_payment_date','last_payment_status','last_payment_date'
  ];

  const header = cols.join(',');
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const body = rows.map(r => cols.map(c => {
    let val = r[c];
    if (c.endsWith('_date') || ['start_date','expires_at','next_payment_date','last_payment_date'].includes(c)) {
      val = r[c] ? new Date(r[c]).toISOString().slice(0,10) : '';
    }
    if (typeof val === 'boolean') val = val ? 'true' : 'false';
    return escape(val);
  }).join(',')).join('\n');

  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0,10);
  a.download = `memberships-${activeViewLabel}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}