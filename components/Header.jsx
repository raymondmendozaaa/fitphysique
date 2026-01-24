"use client";

import { useState, useEffect, useRef } from "react";
import Nav from "./Nav.jsx";
import MobileNav from "./MobileNav.jsx";
import Link from "next/link.js";
import Image from "next/image.js";
import HamburgerMenu from "./HamburgerMenu.jsx";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, usePathname } from "next/navigation";
import useUserData from "@/lib/hooks/useUserData";

const Header = () => {
  const [headerActive, setHeaderActive] = useState(false);
  const [openNav, setOpenNav] = useState(false);

  const { user, profileUrl, role } = useUserData();
  const menuRef = useRef(null);
  const router = useRouter();
  const pathname = usePathname();

  // Handle scroll shadow/height
  useEffect(() => {
    const handleScroll = () => {
      setHeaderActive(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ✅ Smart role-aware redirect from **public** pages only
  useEffect(() => {
    if (!user) return;
    if (!pathname) return;

    // Routes that must NEVER redirect even if user is logged in
    const AUTH_CALLBACK_EXCEPTIONS = [
      "/auth/password-reset",
      "/auth/confirmed",
      "/auth/finish",
    ];

    const isAuthException = AUTH_CALLBACK_EXCEPTIONS.some((route) =>
      pathname.startsWith(route)
    );

    const isAuthRoute = pathname.startsWith("/auth");

    // Only treat these as "public marketing" pages:
    const isPublicRoute = pathname === "/" || isAuthRoute;

    // 🚫 Do NOT redirect away from callback/exception routes
    if (!isPublicRoute || isAuthException) return;

    const DASHBOARD_ROUTE_BY_ROLE = {
      admin: "/admin",
      manager: "/admin",
      staff: "/admin",
      member: "/member",
      guest: "/member", // 🔁 change to "/guest" later if you make a guest dashboard
    };

    const isAdminLike = ["admin", "manager", "staff"].includes(role);
    const target =
      DASHBOARD_ROUTE_BY_ROLE[role] ||
      (isAdminLike ? "/admin" : "/member");

    // Avoid pointless replaces if already there
    if (pathname !== target) {
      router.replace(target);
    }
  }, [user, role, pathname, router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // No setUser here — useUserData will pick up the change on a fresh load
    router.push("/auth/login");
  };

  return (
    <header
      className={`${
        headerActive ? "h-[100px]" : "h-[124px]"
      } fixed max-w-[1920px] top-0 w-full bg-primary-200
      transition-all z-50`}
    >
      <div className="container mx-auto h-full flex items-center justify-between">
        <Link href="/">
          <Image src={"/assets/img/logo.png"} width={117} height={55} alt="Logo" />
        </Link>

        <Nav
          containerStyles="py-12 flex gap-4 text-base uppercase font-medium hidden transition-all xl:flex"
        />

        <div ref={menuRef} className="flex items-center gap-4">
          {/* Desktop right side (email + avatar OR login/register) */}
          <div className="hidden xl:flex text-white gap-4">
            {user ? (
              <div className="flex text-white gap-4 items-center">
                <span className="text-sm">{user.email}</span>
                <img
                  src={
                    profileUrl ||
                    "https://zfhcsoopaaixotxbopoi.supabase.co/storage/v1/object/public/profile-pictures/default_silhouette.png"
                  }
                  alt="Profile Picture"
                  className="w-10 h-10 rounded-full border-2 border-yellow-400 shadow-md"
                />
                <button
                  onClick={handleLogout}
                  className="text-red-500 hover:text-red-400 transition-all"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="hidden xl:flex text-white gap-6">
                <Link
                  href="/auth/login"
                  className="hover:text-accent transition-all text-base uppercase font-medium"
                >
                  Login
                </Link>
                <Link
                  href="/auth/signup"
                  className="hover:text-accent transition-all text-base uppercase font-medium"
                >
                  Register
                </Link>
              </div>
            )}
          </div>

          {/* Mobile nav */}
          <MobileNav
            containerStyles={`${
              headerActive ? "top-[90px]" : "top-[124px]"
            } 
            ${
              openNav
                ? "max-h-max pt-8 pb-10 border-t border-white/10"
                : "max-h-0 pt-0 pb-0 overflow-hidden border-white/8"
            }
            flex flex-col text-center gap-8 fixed bg-primary-200 w-full left-0 
            text-base uppercase font-medium text-white transition-all xl:hidden`}
            setOpenNav={setOpenNav}
          />

          <HamburgerMenu openNav={openNav} setOpenNav={setOpenNav} />
        </div>
      </div>
    </header>
  );
};

export default Header;