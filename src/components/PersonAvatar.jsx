import { getPersonAvatar } from "@/lib/personAvatars";
import { PAID_BY_CODES } from "@/lib/constants";

export default function PersonAvatar({ code, size = "md", showName = false }) {
  const person = getPersonAvatar(code);
  
  if (!code) return null;

  const sizeClasses = {
    xs: "w-6 h-6",
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
  };
  
  const textSizeClasses = {
    xs: "text-xs",
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  // Has a photo avatar
  if (person?.image) {
    return (
      <div className="flex items-center gap-2">
        <img
          src={person.image}
          alt={person.name}
          className={`${sizeClasses[size]} rounded-full object-cover border border-border flex-shrink-0`}
          title={person.name}
        />
        {showName && <span className={`font-medium ${textSizeClasses[size]}`}>{person.name}</span>}
      </div>
    );
  }

  // Fallback: show code badge + label from PAID_BY_CODES
  const label = PAID_BY_CODES.find(p => p.code === code)?.label || code;
  const displayName = person?.name || label;

  return (
    <div className="flex items-center gap-2">
      <div
        className={`${sizeClasses[size]} rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold border border-border`}
        style={{ backgroundColor: "var(--bg-surface-2)", color: "var(--text-secondary)" }}
        title={displayName}
      >
        {code}
      </div>
      {showName && <span className={`font-medium ${textSizeClasses[size]}`}>{displayName}</span>}
    </div>
  );
}