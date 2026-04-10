import { SelectItem } from "@/components/ui/select";
import { getCategoryIcon } from "@/lib/categoryIcons";

export default function CategorySelectItem({ category }) {
  const { icon: Icon, color, bg } = getCategoryIcon(category);
  
  return (
    <SelectItem value={category} className="flex items-center gap-2">
      <div className="flex items-center gap-2 w-full">
        <div className="rounded-full p-1" style={{ backgroundColor: bg }}>
          <Icon className="w-3 h-3" style={{ color }} />
        </div>
        <span>{category}</span>
      </div>
    </SelectItem>
  );
}