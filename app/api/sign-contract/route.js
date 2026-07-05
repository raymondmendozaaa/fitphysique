// app/api/sign-contract/route.js
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getNowUtcIso } from "@/lib/utils/dateTime";

function getBearerToken(req) {
  const authHeader = req.headers.get("authorization") || "";

  return authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
}

function getRequestIp(req, clientIp = null) {
  const forwardedFor = req.headers.get("x-forwarded-for");

  return (
    forwardedFor?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    clientIp ||
    "unknown"
  );
}

function normalizeUuidLike(value) {
  return value ? String(value).trim() : null;
}

async function getAuthenticatedUserId(req) {
  const token = getBearerToken(req);

  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Missing auth token.",
      userId: null,
    };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data?.user?.id) {
    return {
      ok: false,
      status: 401,
      error: "Invalid or expired session.",
      userId: null,
    };
  }

  return {
    ok: true,
    status: 200,
    error: null,
    userId: data.user.id,
  };
}

async function verifyContractMatchesPlan({ contractId, planDurationId }) {
  const { data: contractRow, error } = await supabaseAdmin
    .from("contracts")
    .select("id, plan_duration_id, version")
    .eq("id", contractId)
    .maybeSingle();

  if (error) {
    console.error("❌ Contract lookup error:", error);

    return {
      ok: false,
      status: 500,
      error: "Failed to verify contract.",
      contract: null,
    };
  }

  if (!contractRow) {
    return {
      ok: false,
      status: 404,
      error: "Contract not found.",
      contract: null,
    };
  }

  if (String(contractRow.plan_duration_id) !== String(planDurationId)) {
    return {
      ok: false,
      status: 400,
      error: "Contract does not match selected plan.",
      contract: null,
    };
  }

  return {
    ok: true,
    status: 200,
    error: null,
    contract: contractRow,
  };
}

async function verifyLocationExists(locationId) {
  if (!locationId) {
    return {
      ok: true,
      status: 200,
      error: null,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .maybeSingle();

  if (error) {
    console.error("❌ Location lookup error:", error);

    return {
      ok: false,
      status: 500,
      error: "Failed to verify location.",
    };
  }

  if (!data?.id) {
    return {
      ok: false,
      status: 400,
      error: "Invalid location_id.",
    };
  }

  return {
    ok: true,
    status: 200,
    error: null,
  };
}

export async function POST(req) {
  try {
    const auth = await getAuthenticatedUserId(req);

    if (!auth.ok) {
      return Response.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }

    const authenticatedUserId = auth.userId;
    const body = await req.json().catch(() => ({}));

    const {
      userId,
      planDurationId,
      contractId,
      signature,
      agreed,
      contractVersion,
      latitude,
      longitude,
      accuracy,
      location_id,
      ipAddress: clientIp,
    } = body;

    const cleanUserId = normalizeUuidLike(userId);
    const cleanPlanDurationId = normalizeUuidLike(planDurationId);
    const cleanContractId = normalizeUuidLike(contractId);
    const cleanLocationId = normalizeUuidLike(location_id);
    const cleanSignature = String(signature || "").trim();

    if (!cleanPlanDurationId || !cleanContractId || !cleanSignature || !agreed) {
      return Response.json(
        {
          ok: false,
          error: "Missing required contract signature fields.",
        },
        { status: 400 }
      );
    }

    if (cleanUserId && cleanUserId !== authenticatedUserId) {
      return Response.json(
        {
          ok: false,
          error: "You cannot sign a contract for another user.",
        },
        { status: 403 }
      );
    }

    const contractCheck = await verifyContractMatchesPlan({
      contractId: cleanContractId,
      planDurationId: cleanPlanDurationId,
    });

    if (!contractCheck.ok) {
      return Response.json(
        { ok: false, error: contractCheck.error },
        { status: contractCheck.status }
      );
    }

    const locationCheck = await verifyLocationExists(cleanLocationId);

    if (!locationCheck.ok) {
      return Response.json(
        { ok: false, error: locationCheck.error },
        { status: locationCheck.status }
      );
    }

    const finalIp = getRequestIp(req, clientIp);
    const createdAt = getNowUtcIso();

    const { data: signatureRow, error: insertError } = await supabaseAdmin
      .from("contract_signatures")
      .insert({
        user_id: authenticatedUserId,
        plan_duration_id: cleanPlanDurationId,
        contract_id: cleanContractId,
        signature: cleanSignature,
        agreed: true,
        version: contractVersion ?? contractCheck.contract.version ?? null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        gps_accuracy: accuracy ?? null,
        ip_address: finalIp,
        location_id: cleanLocationId,
        created_at: createdAt,
      })
      .select("id, created_at")
      .single();

    if (insertError) {
      console.error("❌ Signature insert error:", insertError);

      return Response.json(
        {
          ok: false,
          error: "Failed to save signature.",
        },
        { status: 500 }
      );
    }

    return Response.json(
      {
        ok: true,
        contract_signature_id: signatureRow.id,
        created_at: signatureRow.created_at,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ sign-contract route error:", error);

    return Response.json(
      {
        ok: false,
        error: error?.message || "Invalid request.",
      },
      { status: 400 }
    );
  }
}