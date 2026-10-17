"use client";

import { AnimatePresence, motion } from "motion/react";

/** The dealt word, letter by letter. */
export function Word({ word }: { word: string }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.h1 key={word} className="tx-word flex whitespace-pre" aria-label={word} exit={{ opacity: 0, y: -18, transition: { duration: 0.15 } }}>
        {word.split("").map((ch, i) => (
          <motion.span
            key={i}
            aria-hidden
            initial={{ opacity: 0, y: 28, rotate: 8, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, rotate: 0, filter: "blur(0px)" }}
            transition={{ type: "spring", stiffness: 520, damping: 26, delay: i * 0.035 }}
            className="inline-block"
          >
            {ch}
          </motion.span>
        ))}
      </motion.h1>
    </AnimatePresence>
  );
}
