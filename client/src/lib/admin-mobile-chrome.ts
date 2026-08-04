export type AdminMobileChromeDirection = "up" | "down" | null;

export type AdminMobileChromeScrollState = {
    scrollTop: number;
    hidden: boolean;
    direction: AdminMobileChromeDirection;
    directionalTravel: number;
};

const TOP_REVEAL_OFFSET = 12;
const HIDE_START_OFFSET = 24;
const HIDE_TRAVEL = 18;
const REVEAL_TRAVEL = 14;
const SUBPIXEL_DELTA = 0.5;

export function createAdminMobileChromeScrollState(
    hidden = false,
    scrollTop = 0,
): AdminMobileChromeScrollState {
    return {
        scrollTop: Math.max(0, scrollTop),
        hidden,
        direction: null,
        directionalTravel: 0,
    };
}

export function syncAdminMobileChromeScroll(
    state: AdminMobileChromeScrollState,
    scrollTop: number,
): AdminMobileChromeScrollState {
    const nextScrollTop = Math.max(0, scrollTop);
    return {
        scrollTop: nextScrollTop,
        hidden: state.hidden,
        direction: null,
        directionalTravel: 0,
    };
}

export function updateAdminMobileChromeScroll(
    state: AdminMobileChromeScrollState,
    scrollTop: number,
    directionHint: AdminMobileChromeDirection = null,
): AdminMobileChromeScrollState {
    const nextScrollTop = Math.max(0, scrollTop);
    const delta = nextScrollTop - state.scrollTop;

    if (Math.abs(delta) < SUBPIXEL_DELTA) {
        return { ...state, scrollTop: nextScrollTop };
    }

    const direction: AdminMobileChromeDirection = delta > 0 ? "down" : "up";
    if (directionHint && directionHint !== direction) {
        return { ...state, scrollTop: nextScrollTop };
    }

    const directionalTravel = state.direction === direction
        ? state.directionalTravel + Math.abs(delta)
        : Math.abs(delta);

    let hidden = state.hidden;
    let nextTravel = directionalTravel;
    if (hidden && direction === "up" && nextScrollTop <= TOP_REVEAL_OFFSET && directionHint === "up") {
        hidden = false;
        nextTravel = 0;
    } else if (!hidden && direction === "down" && nextScrollTop > HIDE_START_OFFSET && directionalTravel >= HIDE_TRAVEL) {
        hidden = true;
        nextTravel = 0;
    } else if (hidden && direction === "up" && directionalTravel >= REVEAL_TRAVEL) {
        hidden = false;
        nextTravel = 0;
    }

    return {
        scrollTop: nextScrollTop,
        hidden,
        direction,
        directionalTravel: nextTravel,
    };
}
