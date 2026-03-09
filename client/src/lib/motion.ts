// @/lib/motion.ts

export const transitions = {
    spring: { type: "spring", stiffness: 400, damping: 28 },
    snappy: { type: "spring", stiffness: 600, damping: 35 },
    smooth: { type: "tween", duration: 0.22, ease: [0.4, 0, 0.2, 1] },
    bounce: { type: "spring", stiffness: 500, damping: 20, mass: 0.8 },
    slow: { type: "tween", duration: 0.45, ease: "easeInOut" },
}

export const variants: any = {

    // ── PAGE / ROUTE ENTRY ──────────────────────────────
    pageEnter: {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0, transition: { type: "tween", duration: 0.12, ease: [0.4, 0, 0.2, 1] } },
        exit: { opacity: 0, transition: { duration: 0.06 } },
    },

    // ── SECTION / CARD ENTRY ────────────────────────────
    sectionEnter: {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0, transition: transitions.smooth },
    },

    // ── STAGGERED LIST CHILDREN ─────────────────────────
    staggerContainer: {
        animate: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
    },
    staggerItem: {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0, transition: transitions.smooth },
    },

    // ── BUTTON FEEDBACK ─────────────────────────────────
    buttonTap: {
        whileHover: { scale: 1.02, transition: transitions.snappy },
        whileTap: { scale: 0.96, transition: transitions.snappy },
    },

    // ── ICON BUTTON (smaller scale) ──────────────────────
    iconButtonTap: {
        whileHover: { scale: 1.08, rotate: 5, transition: transitions.bounce },
        whileTap: { scale: 0.88, transition: transitions.snappy },
    },

    // ── INPUT / FIELD FOCUS ─────────────────────────────
    fieldFocus: {
        whileFocus: {
            scale: 1.008,
            boxShadow: "0 0 0 2px hsl(var(--ring))",
            transition: transitions.spring,
        },
    },

    // ── ERROR SHAKE ─────────────────────────────────────
    errorShake: {
        animate: { x: [0, -10, 10, -8, 8, -4, 4, 0] },
        transition: { duration: 0.45, ease: "easeInOut" },
    },

    // ── SUCCESS POP ─────────────────────────────────────
    successPop: {
        initial: { scale: 0.5, opacity: 0 },
        animate: { scale: 1, opacity: 1, transition: transitions.bounce },
    },

    // ── MODAL / DIALOG ──────────────────────────────────
    modalBackdrop: {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration: 0.2 } },
        exit: { opacity: 0, transition: { duration: 0.15 } },
    },
    modalContent: {
        initial: { opacity: 0, scale: 0.94, y: 10 },
        animate: { opacity: 1, scale: 1, y: 0, transition: transitions.spring },
        exit: { opacity: 0, scale: 0.96, y: 6, transition: { duration: 0.15 } },
    },

    // ── DROPDOWN / POPOVER ──────────────────────────────
    dropdownEnter: {
        initial: { opacity: 0, scaleY: 0.92, y: -4 },
        animate: { opacity: 1, scaleY: 1, y: 0, transition: transitions.snappy },
        exit: { opacity: 0, scaleY: 0.95, y: -2, transition: { duration: 0.1 } },
    },

    // ── SIDEBAR / DRAWER ────────────────────────────────
    sidebarEnter: {
        initial: { x: "-100%" },
        animate: { x: 0, transition: transitions.spring },
        exit: { x: "-100%", transition: { duration: 0.2 } },
    },

    // ── TOAST / NOTIFICATION ────────────────────────────
    toastEnter: {
        initial: { opacity: 0, y: 20, scale: 0.92 },
        animate: { opacity: 1, y: 0, scale: 1, transition: transitions.bounce },
        exit: { opacity: 0, y: -10, scale: 0.95, transition: { duration: 0.2 } },
    },

    // ── SKELETON / LOADING PULSE ────────────────────────
    skeleton: {
        animate: {
            opacity: [0.4, 0.8, 0.4],
            transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
        },
    },

    // ── TAB INDICATOR SLIDE ──────────────────────────────
    tabIndicator: {
        layoutId: "tab-indicator",
        transition: transitions.spring,
    },

    // ── FLOATING ACTION BUTTON ──────────────────────────
    fab: {
        initial: { scale: 0, rotate: -45 },
        animate: { scale: 1, rotate: 0, transition: transitions.bounce },
        whileHover: { scale: 1.1, transition: transitions.snappy },
        whileTap: { scale: 0.93 },
    },

    // ── NUMBER / COUNTER ROLL ───────────────────────────
    numberRoll: {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0, transition: transitions.spring },
    },

}
