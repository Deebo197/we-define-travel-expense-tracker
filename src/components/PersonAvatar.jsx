import { getPersonAvatar } from "@/lib/personAvatars";

export default function PersonAvatar({ code, size = "md", showName = false }) {
  const person = getPersonAvatar(code);
  
  if (!person) return null;
  
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