"use client";

import { Link as ScrollLink } from "react-scroll";
import { useState, useEffect } from "react";
import { useMediaQuery } from "react-responsive";
import Link from "next/link";

const MobileNav = ({ containerStyles, setOpenNav }) => {
    const [sections, setSections] = useState([]);
    const [activeSection, setActiveSection] = useState("");
    const isMobile = useMediaQuery({ query: "(max-width: 600px)" });

    useEffect(() => {
        const sectionIds = Array.from(document.querySelectorAll("[id]")).map((el) => el.id);
        setSections(sectionIds);
    }, []);

    useEffect(() => {
        const handleScroll = () => {
            const visibleSection = sections.find((id) => {
                const el = document.getElementById(id);
                return el?.getBoundingClientRect().top <= 100 && el?.getBoundingClientRect().bottom >= 100;
            });
            setActiveSection(visibleSection || "");
        };

        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, [sections]);

    return (
        <nav className={`${containerStyles}`}>
            {/* Section Links */}
            <div className="flex flex-col gap-6">
                {sections.map((id) => (
                    <ScrollLink
                        key={id}
                        to={id}
                        smooth
                        spy
                        activeClass={`${!isMobile && "active"}`}
                        offset={-80}
                        className={`
                          cursor-pointer transition-all duration-300 ease-in-out 
                          ${activeSection === id 
                            ? "text-accent text-opacity-100" 
                            : "text-gray-500 hover:text-accent text-opacity-70"}
                        `}
                        onClick={() => setOpenNav(false)} // Closes menu when clicking a section
                    >
                        {id.charAt(0) + id.slice(1)}
                    </ScrollLink>
                ))}
            </div>

            {/* Divider */}
            <div className="border-t border-white/20 my-1"></div>

            {/* Login & Register (Styled Differently) */}
            <div className="flex flex-col gap-4 text-center">
                <Link 
                    href="/login" 
                    className="text-white hover:text-accent transition-all" 
                    onClick={() => setOpenNav(false)}
                >
                    Login
                </Link>
                <Link 
                    href="/register" 
                    className=" text-white rounded-md hover:text-accent transition-all" 
                    onClick={() => setOpenNav(false)}
                >
                    Register
                </Link>
            </div>
        </nav>
    );
};

export default MobileNav;