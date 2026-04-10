import { getCategoryIcon } from "@/lib/categoryIcons";

export default function CategoryBadge({ category, showLabel = true }) {
  if (!category) return null;
  
  const { icon: Icon, color, bg } = getCategoryIcon(category);
  
  return (
    <div className="flex items-center gap-2">
      <div className="flex-shrink-0 rounded-full p-1.5" style={{ backgroundColor: bg }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      {showLabel && <span className="text-sm text-muted-foreground">{category}</span>}
    </div>
  );
}