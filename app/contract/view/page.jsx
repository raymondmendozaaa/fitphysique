"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { showError } from "@/lib/utils/toastUtils";
import { formatDateTimeInTimeZone } from "@/lib/utils/dateTime";
import withAuth from "@/lib/withAuth";
import ContractPDFPreview from "@/components/ContractPDFPreview";

function ViewContract({ user }) {
  const [contractData, setContractData] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchContract = async () => {
      const { data, error } = await supabase
        .from("contract_signatures")
        .select(`
          *,
          contracts(content, version),
          location:locations(name)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        showError("Failed to fetch contract");
        console.error("Fetch error:", error);
        setLoading(false);
        return;
      }

      if (!data) {
        setContractData(null);
      } else {
        setContractData(data);
      }

      setLoading(false);
    };

    fetchContract();
  }, [user.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <p>Loading your contract...</p>
      </div>
    );
  }

  if (!contractData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <div className="text-center space-y-3">
          <h2 className="text-xl font-bold">No Signed Contract Found</h2>
          <p className="text-gray-400">You haven’t signed a contract yet.</p>
          <button
            onClick={() => router.push("/member")}
            className="mt-4 px-5 py-2 bg-yellow-500 text-black rounded hover:bg-yellow-600"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const { contracts, signature, agreed, created_at, ip_address } = contractData;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex justify-center items-start pt-36 px-4 py-24">
      <div className="w-full max-w-2xl bg-gray-900 p-6 rounded-xl shadow-lg mt-12">
        <h2 className="text-2xl font-bold mb-4">Your Signed Contract</h2>

        {/* ✅ Scrollable Contract Content Box */}
        <div
          className="text-sm text-gray-300 whitespace-pre-wrap border border-gray-700 rounded p-4 mb-4 bg-gray-800 overflow-y-auto"
          style={{ maxHeight: "24rem" }}
        >
          {contracts?.content || "No contract content available."}
        </div>

        {/* Contract Metadata */}
        <div className="space-y-2 text-sm text-gray-300">
          <p><span className="font-semibold">Version:</span> {contracts?.version || "N/A"}</p>
          <p><span className="font-semibold">Signed By:</span> {signature || "N/A"}</p>
          <p><span className="font-semibold">Agreed:</span> {agreed ? "Yes" : "No"}</p>
          <p><span className="font-semibold">Signed On:</span> {formatDateTimeInTimeZone(created_at)}</p>
          <p><span className="font-semibold">IP Address:</span> {ip_address || "N/A"}</p>
          <p><span className="font-semibold">Location:</span> {contractData.location?.name || "N/A"}</p>
        </div>

        {/* 🧾 PDF Viewer + Download Button */}
        <div className="mt-6">
          <ContractPDFPreview userId={user.id} />
        </div>

        <button
          onClick={() => router.push("/member")}
          className="mt-8 px-6 py-2 bg-yellow-500 text-black rounded hover:bg-yellow-600"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}

export default withAuth(ViewContract, "member");