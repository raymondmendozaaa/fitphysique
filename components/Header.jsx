"use client";

import { useState, useEffect, useRef } from "react";
import Nav from "./Nav.jsx";
import MobileNav from "./MobileNav.jsx";
import Link from "next/link.js";
import Image from "next/image.js";
import HamburgerMenu from "./HamburgerMenu.jsx"; // Import the component

const Header = () => {
    const [headerActive, setHeaderActive] = useState(false);
    const [openNav, setOpenNav] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        const handleScroll = () => {
            setHeaderActive(window.scrollY > 50);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setOpenNav(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <header
            className={`${
                headerActive ? "h-[100px]" : "h-[124px]"
            } fixed max-w-[1920px] top-0 w-full bg-primary-200 h-[100px] 
            transition-all z-50`}
        >
            <div className="container mx-auto h-full flex items-center justify-between">
                {/* Logo */}
                <Link href="">
                    <Image src={"/assets/img/logo.png"} width={117} height={55} alt="Logo" />
                </Link>

                {/* Desktop Nav */}
                <Nav containerStyles="py-12 flex gap-4 text-base uppercase font-medium hidden transition-all xl:flex" />

                {/* Right section */}
                <div ref={menuRef} className="flex items-center gap-4">
                    {/* Login & Register (visible on large screens) */}
                    <div className="hidden xl:flex text-white gap-4">
                        <button className="hover:text-accent transition-all text-base uppercase font-medium">Login</button>
                        <button className="hover:text-accent transition-all text-base uppercase font-medium">Register</button>
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