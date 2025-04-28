import toast from "react-hot-toast";

export const showSuccess = (message, id = null) => {
  toast.success(message, id ? { id } : undefined);
};

export const showError = (message, id = null) => {
  toast.error(message, id ? { id } : undefined);
};

export const showLoading = (message) => {
  return toast.loading(message);
};

export const dismissToast = (id) => {
  toast.dismiss(id);
};