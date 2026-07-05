"use client";

import {
  PDFDownloadLink,
  PDFViewer,
  Page,
  Text,
  View,
  Document,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import THE_GYM_LOGO from "@/public/assets/img/logos/the-gym-logo.png";
import { formatDateTimeInTimeZone } from "@/lib/utils/dateTime";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#111",
    flexDirection: "column",
    position: "relative",
  },
  header: {
    fontSize: 18,
    textAlign: "center",
    marginBottom: 30,
    textTransform: "uppercase",
    fontWeight: "bold",
  },
  section: {
    marginVertical: 10,
  },
  field: {
    marginBottom: 5,
  },
  label: {
    fontWeight: "bold",
    fontSize: 12,
    marginBottom: 12,
    textDecoration: "underline",
    textTransform: "uppercase",
  },
  signatureBlock: {
    marginTop: 20,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 9,
    color: "#666",
    borderTop: "1px solid #ccc",
    paddingTop: 8,
    textAlign: "center",
  },
});

const ContractDocument = ({ contract }) => {
  const pages = [];

  // First page — with big logo and main content
  pages.push(
    <Page key="page-1" size="A4" style={styles.page} wrap>
      <Text style={[styles.header, { marginBottom: 30 }]}>
        THE GYM CORPORATE MEMBERSHIP AGREEMENT
      </Text>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <View style={{ width: "70%" }}>
          <Text style={styles.label}>Membership Information</Text>
          <Text style={styles.field}>Full Name: {contract.full_name}</Text>
          <Text style={styles.field}>Membership Plan: {contract.plan}</Text>
          <Text style={styles.field}>Signed On: {contract.created_at}</Text>
          <Text style={styles.field}>Signed By: {contract.signature}</Text>
          <Text style={styles.field}>IP Address: {contract.ip_address}</Text>
          <Text style={styles.field}>Location: {contract.location_name}</Text>
          <Text style={styles.field}>Version: {contract.version}</Text>
        </View>

        <View
          style={{
            width: "25%",
            justifyContent: "center",
            alignItems: "flex-start",
            paddingTop: 20,
          }}
        >
          {contract.logo && (
            <Image
              src={contract.logo}
              style={{ width: 60, height: 60, marginLeft: -40 }}
            />
          )}
        </View>
      </View>

      <View style={styles.signatureBlock}>
        <Text style={styles.label}>Member Agreement:</Text>
        <Text style={styles.field}>{contract.content}</Text>
      </View>

      {/* Footer */}
      <View fixed style={styles.footer}>
        <Text>support@thegym.com</Text>
        <Text>Powered by THE GYM</Text>
        <Text style={{ marginTop: 4 }}>
          This document is confidential and intended only for the recipient. Unauthorized distribution is prohibited.
        </Text>
        <Text
          style={{ marginTop: 4 }}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </View>
    </Page>
  );

  return <Document>{pages}</Document>;
};

export default function ContractPDFPreview({ userId }) {
  const [contract, setContract] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const fetchContract = async () => {
      const { data, error } = await supabase
        .from("contract_signatures")
        .select(`
          *,
          contracts(content, version),
          location:locations(name),
          users(full_name),
          plan_durations(plan_name, duration_label)
        `)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setContract({
          full_name: data.users?.full_name || "N/A",
          plan: data.plan_durations
            ? `${data.plan_durations.plan_name} - ${data.plan_durations.duration_label}`
            : "N/A",
          created_at: formatDateTimeInTimeZone(data.created_at),
          signature: data.signature,
          ip_address: data.ip_address,
          location_name: data.location?.name || "N/A",
          content: data.contracts?.content || "N/A",
          version: data.contracts?.version || "N/A",
          logo: THE_GYM_LOGO.src,
        });
      }
    };

    fetchContract();
  }, [userId]);

  if (!contract) return <p className="text-white">Preparing your PDF...</p>;

  return (
    <div className="mt-10">
      <h3 className="text-lg font-semibold text-white mb-2">Contract Preview</h3>

      <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
        <div className="w-48 h-32 bg-black border border-gray-600 rounded overflow-hidden pointer-events-none">
          <PDFViewer width="100%" height="100%" showToolbar={false}>
            <ContractDocument contract={contract} />
          </PDFViewer>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="mt-4 sm:mt-0 px-4 py-2 bg-yellow-500 text-black rounded hover:bg-yellow-600"
        >
          Click to View Contract
        </button>
      </div>

      <div className="mt-4">
        <PDFDownloadLink
          document={<ContractDocument contract={contract} />}
          fileName="THE_GYM_Membership_Contract.pdf"
          className="bg-yellow-500 hover:bg-yellow-600 text-black px-6 py-2 rounded shadow"
        >
          {({ loading }) => (loading ? "Generating PDF..." : "Download Signed Contract PDF")}
        </PDFDownloadLink>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center p-4">
          <div className="relative w-full h-full max-w-6xl max-h-[95vh] bg-white rounded shadow-xl overflow-hidden">
            <PDFViewer width="100%" height="100%" showToolbar>
              <ContractDocument contract={contract} />
            </PDFViewer>
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-3 right-3 bg-red-600 text-white px-4 py-1 rounded hover:bg-red-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}