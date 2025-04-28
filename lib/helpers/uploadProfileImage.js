import { supabase } from "@/lib/supabaseClient";
import toast from "react-hot-toast";

const uploadProfileImage = async (file, userId) => {
  const fileExt = file.name.split(".").pop();
  const filePath = `${userId}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from("profile-pictures")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) {
    toast.error("Image upload failed.");
    throw new Error("Upload failed");
  }

  const { data: publicURLData } = supabase.storage
    .from("profile-pictures")
    .getPublicUrl(filePath);

  return publicURLData?.publicUrl;
};

export default uploadProfileImage;