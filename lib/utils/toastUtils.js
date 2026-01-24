import toast from "react-hot-toast";

export const showSuccess = (message, id = null) =>
  toast.success(message, id ? { id } : undefined);

export const showError = (message, id = null) =>
  toast.error(message, id ? { id } : undefined);

export const showLoading = (message) => toast.loading(message);

export const dismissToast = (id) => toast.dismiss(id);

// simple confirm helper used in a few spots
export const askConfirm = (msg) => Promise.resolve(window.confirm(msg));

export const showInfo = (message, id = null) =>
  toast(message, { id, icon: 'ℹ️' });