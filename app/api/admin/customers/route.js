// app/api/admin/customers/route.js
import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const q             = (searchParams.get("q") || "").trim();
    const page          = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize      = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") || 25)));
    const sortKey       = (searchParams.get("sortKey") || "status");
    const sortDir       = (searchParams.get("sortDir") || "asc").toLowerCase() === "desc" ? "desc" : "asc";
    const includeAdmins = (searchParams.get("includeAdmins") || "false") === "true";
    const includeStaff  = (searchParams.get("includeStaff")  || "false") === "true";

    const from = (page - 1) * pageSize;
    const to   = from + pageSize - 1;

    // Only fetch columns the grid actually renders (saves bandwidth)
    let query = supabase
      .from("users_with_status")
      .select(
        "id, customer_no, full_name, email, phone, role, status_label, status_group_rank, latest_membership_start", 
        { count: "estimated" }
      );

    if (!includeAdmins) query = query.neq("role", "admin");
    if (!includeStaff)  query = query.not("role", "in", `("manager","staff")`);

    if (q) {
      const esc = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
      query = query.or(
        [
          `full_name.ilike.%${esc}%`,
          `email.ilike.%${esc}%`,
          `phone.ilike.%${esc}%`,
          `customer_no_text.ilike.%${esc}%`, // ✅ use view column
        ].join(",")
      );
    }

    if (sortKey === "status") {
      query = query
        .order("status_group_rank", { ascending: sortDir === "asc" })
        .order("latest_membership_start", { ascending: false, nullsFirst: false })
        .order("full_name", { ascending: true });
    } else {
      query = query.order(sortKey, { ascending: sortDir === "asc", nullsFirst: true });
    }

    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      rows: data || [],
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Failed to fetch customers" }, { status: 500 });
  }
}