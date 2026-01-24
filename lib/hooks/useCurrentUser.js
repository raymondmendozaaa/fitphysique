"use client";

import useUserData from "@/lib/hooks/useUserData";

export default function useCurrentUser() {
  return useUserData();
}