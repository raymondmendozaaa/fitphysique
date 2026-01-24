// app/api/admin/audit/recent/route.js
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
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100);
    const cursorBefore = searchParams.get('cursorBefore');  // ISO datetime
    const action = searchParams.get('action') || null;
    const adminId = searchParams.get('adminId') || null;
    const targetUserId = searchParams.get('targetUserId') || null;
    const q = searchParams.get('q') || null;                // name/email free text (admin or target)
    const dateFrom = searchParams.get('dateFrom') || null;  // ISO
    const dateTo = searchParams.get('dateTo') || null;      // ISO

    // Auth & admin check
    const supabaseCaller = clientWithToken(req);
    const { data: callerAuth } = await supabaseCaller.auth.getUser();
    if (!callerAuth?.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const { data: callerRow } = await supabaseCaller
      .from('users')
      .select('id, role')
      .eq('id', callerAuth.user.id)
      .single();
    if (!callerRow || callerRow.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden: admin only' }, { status: 403 });
    }

    const admin = adminClient();
    let query = admin.from('admin_audit_logs_view').select('*').order('created_at', { ascending: false });

    if (cursorBefore) query = query.lt('created_at', cursorBefore);
    if (action) query = query.eq('action', action);
    if (adminId) query = query.eq('admin_id', adminId);
    if (targetUserId) query = query.eq('target_user_id', targetUserId);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo);

    if (q) {
      // naive OR search on emails/names
      query = query.or(
        `admin_email.ilike.%${q}%,admin_name.ilike.%${q}%,target_email.ilike.%${q}%,target_name.ilike.%${q}%`
      );
    }

    const { data, error } = await query.limit(limit + 1);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });

    let nextCursor = null;
    let rows = data || [];
    if (rows.length > limit) {
      nextCursor = rows[limit - 1].created_at;
      rows = rows.slice(0, limit);
    }

    return NextResponse.json({ rows, nextCursor });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}