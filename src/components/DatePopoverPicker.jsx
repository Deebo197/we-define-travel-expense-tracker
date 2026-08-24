import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

/**
 * Date picker that opens in a Radix popover (rendered via Portal).
 * Unlike the native <input type="date">, the calendar overlays the page
 * and Radix auto-flips it above the trigger when there's no room below,
 * so it never gets cut off by the viewport bottom.
 *
 * Contract matches the native input: value is "yyyy-MM-dd" or "".
 */
export default function DatePopoverPicker({ label, value, onChange, placeholder = "Pick a date" }) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;

  const handleSelect = (date) => {
    if (!date) {
      onChange("");
      return;
    }
    const iso = format(date, "yyyy-MM-dd");
    onChange(iso);
    setOpen(false);
  };

  return (
    <div>
      {label && <Label className="text-sm">{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "mt-1 w-40 justify-start text-left font-normal h-[52px]",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="h-4 w-4 opacity-60" />
            {value ? format(selected, "dd/MM/yyyy") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0"
          align="start"
          sideOffset={6}
          collisionPadding={12}
        >
          <Calendar
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}