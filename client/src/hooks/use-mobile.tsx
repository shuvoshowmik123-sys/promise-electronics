import * as React from "react"
import { detectIsMobileViewport, MOBILE_BREAKPOINT, SHORT_VIEWPORT_HEIGHT } from "@/lib/mobile-viewport"

/**
 * A phone in landscape is 844–932px wide, which sailed past a width-only
 * breakpoint and handed the user the desktop layout mid-rotation. The device
 * did not change; only its orientation did.
 *
 * The decision now also considers height and pointer type — see
 * lib/mobile-viewport for why those two distinguish a rotated phone from a
 * narrow desktop window.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const onChange = () =>
      setIsMobile(
        detectIsMobileViewport({
          width: window.innerWidth,
          height: window.innerHeight,
          coarsePointer: window.matchMedia?.("(pointer: coarse)").matches ?? false,
        }),
      )

    // Width alone is not enough: rotating a phone changes height and
    // orientation without necessarily crossing the width query, so the rotation
    // itself has to be listened for as well.
    const widthQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const heightQuery = window.matchMedia(`(max-height: ${SHORT_VIEWPORT_HEIGHT - 1}px)`)

    widthQuery.addEventListener("change", onChange)
    heightQuery.addEventListener("change", onChange)
    window.addEventListener("orientationchange", onChange)
    window.addEventListener("resize", onChange)

    onChange()

    return () => {
      widthQuery.removeEventListener("change", onChange)
      heightQuery.removeEventListener("change", onChange)
      window.removeEventListener("orientationchange", onChange)
      window.removeEventListener("resize", onChange)
    }
  }, [])

  return !!isMobile
}
