export function validateLoginForm({ email, password }) {
    if (!email || !password) {
      return { valid: false, message: "Please enter both email and password." };
    }
  
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { valid: false, message: "Please enter a valid email address." };
    }
  
    return { valid: true };
  }  