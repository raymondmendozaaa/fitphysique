"use client";

import { Suspense } from "react"; // ✅ Add Suspense
import ContractPageInner from "./ContractPageInner"; // ✅ We'll move your page into a separate component

export default function SignContractPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ContractPageInner />
    </Suspense>
  );
}
