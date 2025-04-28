export default function LoadingSpinner({ size = "md", color = "white" }) {
    const spinnerSize = {
      sm: "h-4 w-4",
      md: "h-6 w-6",
      lg: "h-8 w-8",
    };
  
    return (
      <div className="flex justify-center items-center">
        <div
          className={`animate-spin rounded-full border-4 border-t-transparent ${spinnerSize[size]} border-${color}`}
        />
      </div>
    );
  }
  