import { Suspense } from "react";
import JoinClient from "./JoinClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
          <div className="rounded-xl border border-gray-700 bg-gray-800 px-6 py-4">
            Loading…
          </div>
        </div>
      }
    >
      <JoinClient />
    </Suspense>
  );
}