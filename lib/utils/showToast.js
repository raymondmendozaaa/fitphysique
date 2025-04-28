import toast from "react-hot-toast";

export function showToast(type, message, id = null) {
  const options = id ? { id } : undefined;
  if (type === "success") return toast.success(message, options);
  if (type === "error") return toast.error(message, options);
  if (type === "loading") return toast.loading(message);
}