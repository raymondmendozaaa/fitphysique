"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

const ContractPageInner = dynamic(() => import("./ContractPageInner"), {
  ssr: false,
});

export default function ContractPage() {
  return (
    <Suspense fallback={<div>Loading contract..."</div>}>
      <ContractPageInner />
    </Suspense>
  );
}