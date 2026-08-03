export type AreaNoticeState = { visible: boolean; hasShown: boolean };
export type AreaNoticeEvent = "area-error" | "dismiss";

export const AREA_NOTICE_INITIAL: AreaNoticeState = { visible: false, hasShown: false };

export function areaNoticeReducer(
    state: AreaNoticeState,
    event: AreaNoticeEvent,
): AreaNoticeState {
    switch (event) {
        case "area-error":
            if (state.hasShown) return state;
            return { visible: true, hasShown: true };
        case "dismiss":
            return { visible: false, hasShown: state.hasShown };
    }
}
