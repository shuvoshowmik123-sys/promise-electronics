import * as React from "react"
import { cn } from "@/lib/utils"
import { Input } from "./input"

/**
 * The one phone field in this system.
 *
 * Every number here is Bangladeshi, and the country code is printed in the box
 * rather than typed, so what the customer enters is always the local part:
 * 1812345678, ten digits.
 *
 * People do not type it that way. They type the number the way it is written on
 * their SIM pack and on every shop sign in the country — 018 12345678 — and the
 * leading zero belongs to a national dialling prefix that is redundant once
 * +880 is already shown. So the zero is removed as they type: press 0, then 1,
 * and the field reads "1". Nothing is rejected and no warning appears, because
 * the customer has not made a mistake — they have written their own number
 * correctly and it is the field's job to understand it.
 *
 * Pasting is handled by the same rule. A number copied from a contact card
 * arrives as +8801812345678 or 8801812345678, and the country code is dropped.
 * This used to strip only the leading zero, which meant a pasted +880 number
 * kept its country code, was then cut at ten characters, and silently became
 * 8801812345 — a number belonging to nobody. That is worse than a rejection,
 * because it looks like it worked.
 */

/**
 * Local subscriber digits, whatever form the number arrived in.
 *
 * The country code is only removed when the length says it is a country code.
 * Someone halfway through typing "880..." into an empty field has entered three
 * digits, not a prefix, and erasing them under the cursor would be baffling.
 */
export function toLocalPhoneDigits(raw: string): string {
    let digits = String(raw ?? "").replace(/\D/g, "");

    if (digits.length > 10 && digits.startsWith("880")) {
        digits = digits.slice(3);
    }

    // Leading zeros, not just one: 0018... is a fumbled keypress, not a number.
    digits = digits.replace(/^0+/, "");

    return digits.slice(0, 10);
}

export interface PhoneInputProps
    extends React.InputHTMLAttributes<HTMLInputElement> {
    value?: string
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
    ({ className, value, onChange, ...props }, ref) => {

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const cleaned = toLocalPhoneDigits(e.target.value);

            // A synthetic event so callers keep their ordinary onChange handler
            // and never see anything but the ten local digits.
            const event = {
                ...e,
                target: { ...e.target, value: cleaned },
            } as React.ChangeEvent<HTMLInputElement>;

            onChange?.(event);
        };

        return (
            /**
             * The caller's className goes to the input only, never to this
             * wrapper. Applying it to both drew the border, background and
             * rounding twice, one nested inside the other.
             */
            <div className="relative flex items-center w-full">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none select-none">
                    <span className="text-muted-foreground text-base md:text-sm font-medium pr-1 border-r border-border mr-2 bg-transparent">
                        +880
                    </span>
                </div>
                <Input
                    {...props}
                    ref={ref}
                    type="tel"
                    inputMode="numeric"
                    autoComplete={props.autoComplete ?? "tel-national"}
                    value={value}
                    onChange={handleChange}
                    className={cn("pl-16", className)}
                    placeholder={props.placeholder || "1XXXXXXXXX"}
                    /**
                     * Deliberately not maxLength={10}: a pasted +8801812345678 is
                     * thirteen characters and the browser would refuse the paste
                     * outright before this component ever saw it. The length is
                     * enforced above, after the country code has been removed.
                     */
                />
            </div>
        )
    }
)
PhoneInput.displayName = "PhoneInput"

export { PhoneInput }
