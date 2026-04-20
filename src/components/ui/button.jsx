import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(127,91,255,0.6)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "brand-gradient text-white shadow-lg rounded-2xl",
        destructive:
          "bg-[#FF5C7A] text-white shadow-sm rounded-2xl hover:bg-[#ff3d5f]",
        outline:
          "border border-[rgba(255,255,255,0.12)] bg-[#1C1C26] text-white rounded-2xl hover:bg-[#22222E]",
        secondary:
          "bg-[#1C1C26] border border-[rgba(255,255,255,0.12)] text-white rounded-2xl hover:bg-[#22222E]",
        ghost: "text-[#A1A1B5] hover:bg-[#1C1C26] hover:text-white rounded-2xl",
        link: "text-[#7F5BFF] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[52px] px-6 py-2 text-base",
        sm: "h-9 rounded-xl px-4 text-sm",
        lg: "h-14 rounded-2xl px-8 text-base",
        icon: "h-11 w-11 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }