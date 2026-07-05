import { insertUserClient } from "@/lib/queries/users/client";

export async function insertNewUser({
  id,
  email,
  full_name,
  role = "member",
  onboarded = false,
}) {
  try {
    await insertUserClient({
      id,
      email,
      full_name,
      role,
      onboarded,
    });
  } catch (error) {
    throw new Error(`Failed to save user info: ${error.message}`);
  }
}