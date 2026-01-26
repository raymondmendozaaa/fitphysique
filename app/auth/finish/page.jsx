import { Suspense } from "react";
import FinishClient from "./FinishClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center">Loading…</div>}>
      <FinishClient />
    </Suspense>
  );
}