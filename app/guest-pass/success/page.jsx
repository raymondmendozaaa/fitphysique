export default function GuestPassSuccess() {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
        <h1 className="text-3xl font-bold">Guest Pass Purchased!</h1>
        <p className="mt-4">Check your email for confirmation.</p>
        <a href="/" className="mt-6 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">
          Return to Home
        </a>
      </div>
    );
  }  