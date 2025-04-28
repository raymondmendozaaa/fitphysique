"use client";

import { motion } from "framer-motion";

const HamburgerMenu = ({ openNav, setOpenNav }) => {
    return (
        <button
            onClick={() => setOpenNav((prev) => !prev)}
            className="relative w-12 h-12 flex items-center justify-center xl:hidden ml-auto"
        >
            {/* Hamburger Menu Bars */}
            <motion.div
                className="absolute w-9 h-[5px] bg-white"
                initial={{ y: -8, rotate: 0 }}
                animate={{ rotate: openNav ? 45 : 0, y: openNav ? 0 : -8 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
            />
            <motion.div
                className="absolute w-9 h-[5px] bg-white"
                initial={{ opacity: 1 }}
                animate={{ opacity: openNav ? 0 : 1 }}
                transition={{ duration: 0.2 }}
            />
            <motion.div
                className="absolute w-9 h-[5px] bg-white"
                initial={{ y: 8, rotate: 0 }}
                animate={{ rotate: openNav ? -45 : 0, y: openNav ? 0 : 8 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
            />

            {/* Dumbbell Handles */}
            {[[-14, -14, 45], [14, -14, -45], [-14, 14, -45], [14, 14, 45]].map(
                ([x, y, rotate], index) => (
                    <motion.div
                        key={`bar-main-${index}`}
                        className="absolute w-[7px] h-[20px] bg-white rounded-sm"
                        initial={{ opacity: 0, x, y, rotate: 0 }}
                        animate={{
                            opacity: openNav ? 1 : 0,
                            x: openNav ? x * 0.9 : x,
                            y: openNav ? y * 0.9 : y,
                            rotate: openNav ? rotate : 0,
                        }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                    />
                )
            )}

            {/* Inner Weight Plates */}
            {[[-18, -18, 45], [18, -18, -45], [-18, 18, -45], [18, 18, 45]].map(
                ([x, y, rotate], index) => (
                    <motion.div
                        key={`bar-inner-${index}`}
                        className="absolute w-[5px] h-[15px] bg-white rounded-sm"
                        initial={{ opacity: 0, x, y, rotate: 0 }}
                        animate={{
                            opacity: openNav ? 1 : 0,
                            x: openNav ? x * 0.95 : x,
                            y: openNav ? y * 0.95 : y,
                            rotate: openNav ? rotate : 0,
                        }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                    />
                )
            )}

            {/* Outer Weight Plates */}
            {[[-22, -22, 45], [22, -22, -45], [-22, 22, -45], [22, 22, 45]].map(
                ([x, y, rotate], index) => (
                    <motion.div
                        key={`bar-outer-${index}`}
                        className="absolute w-[4px] h-[10px] bg-white rounded-sm"
                        initial={{ opacity: 0, x, y, rotate: 0 }}
                        animate={{
                            opacity: openNav ? 1 : 0,
                            x: openNav ? x * 0.96 : x,
                            y: openNav ? y * 0.96 : y,
                            rotate: openNav ? rotate : 0,
                        }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                    />
                )
            )}

            {/* Small Black Overlapping Bars (Parallel to Dumbbells) */}
            {[[-6, 2, -45], [6, -1.7, -45]].map(([x, y, rotate], index) => (
                <motion.div
                    key={`bar-overlap-${index}`}
                    className="absolute w-[18px] h-[1px] bg-primary-200"
                    initial={{ opacity: 0, x, y, rotate }}
                    animate={{
                        opacity: openNav ? 1 : 0,
                        x: openNav ? x : 0,
                        y: openNav ? y : 0,
                        rotate: openNav ? rotate : 0,
                    }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                />
            ))}
        </button>
    );
};

export default HamburgerMenu;
