import * as React from "react"
import { cn } from "@/lib/utils"
import { Input } from "./input"

export interface PhoneInputProps
    extends React.InputHTMLAttributes<HTMLInputElement> {
    value?: string
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
    ({ className, value, onChange, ...props }, ref) => {

        // Handle input change to remove leading 0 and enforce max 10 digits
        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            let inputValue = e.target.value.replace(/\D/g, ""); // Remove non-digits

            // If user pastes/types 0 at start, remove all leading zeros
            inputValue = inputValue.replace(/^0+/, "");

            // Max 10 digits
            if (inputValue.length > 10) {
                inputValue = inputValue.substring(0, 10);
            }

            // Create synthetic event to pass up
            const event = {
                ...e,
                target: {
                    ...e.target,
                    value: inputValue,
                },
            } as React.ChangeEvent<HTMLInputElement>;

            if (onChange) {
                onChange(event);
            }
        };

        return (
            <div className={cn("relative flex items-center w-full", className)}>
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none select-none">
                    <span className="text-muted-foreground text-base md:text-sm font-medium pr-1 border-r border-border mr-2 bg-transparent">
                        +880
                    </span>
                </div>
                <Input
                    {...props}
                    ref={ref}
                    type="tel"
                    value={value}
                    onChange={handleChange}
                    className={cn("pl-16", className)} // Padding left to accommodate prefix
                    placeholder={props.placeholder || "1XXXXXXXX"}
                    maxLength={10} // HTML5 validation (backup to JS)
                />
            </div>
        )
    }
)
PhoneInput.displayName = "PhoneInput"

export { PhoneInput }
