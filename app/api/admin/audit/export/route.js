// app/api/admin/audit/export/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function clientWithToken(req) {
  const token = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: token } },
  });
}

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(req) {
  if (process.env.VERCEL_ENV === "preview") {
    return new Response("Admin API disabled in Preview", { status: 403 });
  }
  
  try {
    // admin check
    const supabaseCaller = clientWithToken(req);
    const { data: callerAuth } = await supabaseCaller.auth.getUser();
    if (!callerAuth?.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const { data: callerRow } = await supabaseCaller
      .from('users')
      .select('id, role')
      .eq('id', callerAuth.user.id)
      .single();
    if (!callerRow || callerRow.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    // simple export of last 500 rows
    const admin = adminClient();
    const { data, error } = await admin
      .from('admin_audit_logs_view')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });

    const header = [
      'created_at','action','admin_name','admin_email','target_name','target_email','ip','user_agent','details'
    ];
    const esc = (v) => {
      if (v == null) return '';
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      return `"${s.replaceAll('"', '""')}"`;
    };

    const rows = (data || []).map(r => [
      esc(r.created_at),
      esc(r.action),
      esc(r.admin_name || ''),
      esc(r.admin_email || ''),
      esc(r.target_name || ''),
      esc(r.target_email || ''),
      esc(r.ip || ''),
      esc(r.user_agent || ''),
      esc(r.details || {}),
    ].join(','));

    const csv = [header.join(','), ...rows].join('\n');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="admin_audit_logs.csv"',
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}