// utils/validateOnboardingForm.js
import toast from "react-hot-toast";

export function validateOnboardingForm({ profileImage, selectedPlan, selectedDurationId }) {
  let isValid = true;

  if (!profileImage) {
    toast.error("Please upload a profile picture.");
    isValid = false;
  }

  if (!selectedPlan) {
    toast.error("Please select a membership plan.");
    isValid = false;
  }

  if (!selectedDurationId) {
    toast.error("Please select a plan duration.");
    isValid = false;
  }

  return isValid;
}