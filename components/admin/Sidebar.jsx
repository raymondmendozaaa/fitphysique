'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { name: "Dashboard", href: "/admin" },
  { name: "Customer Hub", href: "/admin/customers" },
  { name: "Memberships", href: "/admin/memberships" },
  { name: "Guest Passes", href: "/admin/guest-passes" },
  { name: "Contracts", href: "/admin/contracts" },
  { name: "Users", href: "/admin/users" },
  { name: "Check-ins", href: "/admin/checkins" },   // ✅ added
  { name: "Locations", href: "/admin/locations" },  // ✅ added
  { name: "Payments", href: "/admin/payments" },
  { name: "Analytics", href: "/admin/analytics" },
  { name: "Settings", href: "/admin/settings" },
];

const Sidebar = () => {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-gray-800 p-6 border-r border-gray-700 fixed top-20 h-[calc(100vh-5rem)] z-40 pt-16">
      <h1 className="text-2xl font-bold mb-6 text-yellow-400">Admin Panel</h1>
      <nav className="space-y-2">
        {tabs.map((tab) => (
          <Link
            key={tab.name}
            href={tab.href}
            className={`block px-4 py-2 rounded-md transition-all ${
              pathname === tab.href
                ? 'bg-yellow-500 text-black font-semibold'
                : 'hover:bg-gray-700 text-gray-300'
            }`}
          >
            {tab.name}
          </Link>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;