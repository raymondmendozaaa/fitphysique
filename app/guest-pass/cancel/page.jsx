export default function GuestPassCancel() {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
        <h1 className="text-3xl font-bold">Purchase Canceled</h1>
        <p className="mt-4">No worries! You can try again anytime.</p>
        <a href="/guest-pass" className="mt-6 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">
          Return to Guest Pass Page
        </a>
      </div>
    );
  }  