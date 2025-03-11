"use client";

import { Link as ScrollLink } from "react-scroll";
import { useState, useEffect } from "react";

const Nav = ({ containerStyles }) => {
  const [sections, setSections] = useState([]);
  const [activeSection, setActiveSection] = useState("");

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
    <nav className={containerStyles}>
      {sections.map((id) => (
        <ScrollLink
          key={id}
          to={id}
          smooth
          spy
          offset={-80}
          className={`
            cursor-pointer transition-all duration-300 ease-in-out 
            ${activeSection === id 
              ? "text-accent text-opacity-100" 
              : "text-gray-500 hover:text-accent text-opacity-70"}
          `}
        >
          {id.charAt(0) + id.slice(1)}
        </ScrollLink>
      ))}
    </nav>
  );
};

export default Nav;