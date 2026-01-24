"use client";

import { useUserContext } from "@/lib/context/UserContext";

export default function useUserData() {
  return useUserContext();
}