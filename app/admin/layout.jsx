'use client';

import Sidebar from '@/components/admin/Sidebar';

export default function AdminLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-gray-900 text-white overflow-x-hidden">
      <Sidebar />
      <main className="flex-1 ml-64 p-8 pt-40 min-w-0 w-full">
        {children}
      </main>
    </div>
  );
}