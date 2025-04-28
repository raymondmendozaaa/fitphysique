export function validateSignupForm({ fullName, email, password }) {
    if (!fullName || !email || !password) {
      return { valid: false, message: "All fields are required." };
    }
  
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { valid: false, message: "Please enter a valid email address." };
    }
  
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\W).{8,}$/;
    if (!passwordRegex.test(password)) {
      return {
        valid: false,
        message:
          "Password must be 8+ characters, include uppercase, lowercase, and a special character.",
      };
    }
  
    return { valid: true };
  }  