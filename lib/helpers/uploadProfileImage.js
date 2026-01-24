import { supabase } from "@/lib/supabaseClient";
import toast from "react-hot-toast";

const uploadProfileImage = async (file, userId) => {
  const fileExt = file.name.split(".").pop();
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);

  // ✅ put images in a folder per user and include timestamp + random for cache-busting
  const filePath = `${userId}/${userId}-${timestamp}-${random}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from("profile-pictures")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) {
    console.error("[uploadProfileImage] uploadError:", uploadError);
    toast.error("Image upload failed.");
    throw new Error("Upload failed");
  }

  const { data: publicURLData, error: urlError } = supabase.storage
    .from("profile-pictures")
    .getPublicUrl(filePath);

  if (urlError) {
    console.error("[uploadProfileImage] getPublicUrl error:", urlError);
    throw new Error("Failed to get public URL");
  }

  return publicURLData?.publicUrl;
};

export default uploadProfileImage;