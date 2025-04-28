"use client";

import { useState, useEffect, useRef } from "react";
import Nav from "./Nav.jsx";
import MobileNav from "./MobileNav.jsx";
import Link from "next/link.js";
import Image from "next/image.js";
import HamburgerMenu from "./HamburgerMenu.jsx";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

const Header = () => {
    const [headerActive, setHeaderActive] = useState(false);
    const [openNav, setOpenNav] = useState(false);
    const [user, setUser] = useState(null);
    const menuRef = useRef(null);
    const router = useRouter();

    useEffect(() => {
        const handleScroll = () => {
            setHeaderActive(window.scrollY > 50);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    useEffect(() => {
        const fetchUser = async () => {
            const { data, error } = await supabase.auth.getSession();
            if (error) console.error("Error fetching session:", error);
            console.log("Session Data:", data); // Debugging log
            setUser(data?.session?.user || null);

            // Redirect if user is logged in
            if (data?.session?.user) {
                router.push("/dashboard");
            }
        };

        fetchUser();

        // Listen for auth state changes (login/logout)
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            console.log("Auth Event:", event, "Session:", session); // Debugging log
            setUser(session?.user || null);

            // Redirect to dashboard if user logs in
            if (session?.user) {
                router.push("/dashboard");
            }
        });

        return () => {
            authListener?.subscription.unsubscribe();
        };
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setUser(null);
        router.push("/");
    };

    return (
        <header
            className={`${
                headerActive ? "h-[100px]" : "h-[124px]"
            } fixed max-w-[1920px] top-0 w-full bg-primary-200 h-[100px] 
            transition-all z-50`}
        >
            <div className="container mx-auto h-full flex items-center justify-between">
                {/* Logo */}
                <Link href="/">
                    <Image src={"/assets/img/logo.png"} width={117} height={55} alt="Logo" />
                </Link>

                {/* Desktop Nav */}
                <Nav containerStyles="py-12 flex gap-4 text-base uppercase font-medium hidden transition-all xl:flex" />

                {/* Right section */}
                <div ref={menuRef} className="flex items-center gap-4">
                    {/* User Authentication Section */}
                    <div className="hidden xl:flex text-white gap-4">
                        {user ? (
                            <div className="hidden xl:flex text-white gap-4 items-center">
                                <span className="text-sm">{user.email}</span>
                                <button onClick={handleLogout} className="text-red-500 hover:text-red-400 transition-all">
                                    Logout
                                </button>
                            </div>
                        ) : (
                            <div className="hidden xl:flex text-white gap-6">  {/* Increased gap from 4 to 6 */}
                                <Link href="/auth/login" className="hover:text-accent transition-all text-base uppercase font-medium">
                                    Login
                                </Link>
                                <Link href="/auth/signup" className="hover:text-accent transition-all text-base uppercase font-medium">
                                    Register
                                </Link>
                            </div>
                        )}
                    </div>

                    {/* Mobile Nav */}
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

                    {/* Hamburger Menu Component */}
                    <HamburgerMenu openNav={openNav} setOpenNav={setOpenNav} />
                </div>
            </div>
        </header>
    );
};

export default Header;