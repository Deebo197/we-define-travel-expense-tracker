import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-[52px] w-full rounded-[14px] border border-[rgba(255,255,255,0.06)] bg-[#1C1C26] px-4 py-2 text-base text-white shadow-sm transition-all duration-200",
        "placeholder:text-[#6C6C80]",
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