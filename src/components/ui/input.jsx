import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-[52px] w-full rounded-[14px] border px-4 py-2 text-base shadow-sm transition-all duration-200",
        "bg-[var(--bg-surface-2)] border-[var(--border-soft)] text-[var(--text-primary)]",
        "placeholder:text-[var(--text-tertiary)]",
        "focus-visible:outline-none focus-visible:border-[#7F5BFF] focus-visible:shadow-[0_0_0_4px_rgba(127,91,255,0.15)]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-white",
        className
      )}
      ref={ref}
      {...props}
    />
  );
})
Input.displayName = "Input"

export { Input }