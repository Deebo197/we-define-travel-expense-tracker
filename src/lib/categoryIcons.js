import {
  Plane, Utensils, Megaphone, Target, Building, Code, Phone, Briefcase,
  Users, CreditCard, Shield, Home, Box, Hotel, Music, Car, Sparkles
} from "lucide-react";

export const CATEGORY_ICONS = {
  // WDT Categories
  "WDT - Travel": { icon: Plane, color: "#3b82f6", bg: "#dbeafe" },
  "WDT - Client Entertainment & Networking": { icon: Utensils, color: "#ec4899", bg: "#fce7f3" },
  "WDT - Marketing & Advertising": { icon: Megaphone, color: "#f59e0b", bg: "#fef3c7" },
  "WDT - Partner / Campaign Costs": { icon: Target, color: "#ef4444", bg: "#fee2e2" },
  "WDT - Office & General Costs": { icon: Building, color: "#8b5cf6", bg: "#ede9fe" },
  "WDT - Technology & Software": { icon: Code, color: "#10b981", bg: "#d1fae5" },
  "WDT - Phone & Communication": { icon: Phone, color: "#06b6d4", bg: "#cffafe" },
  "WDT - Professional Fees": { icon: Briefcase, color: "#6366f1", bg: "#e0e7ff" },
  "WDT - Staff Costs": { icon: Users, color: "#14b8a6", bg: "#ccfbf1" },
  "WDT - Finance Costs": { icon: CreditCard, color: "#f97316", bg: "#ffedd5" },
  "WDT - Insurance": { icon: Shield, color: "#0ea5e9", bg: "#e0f2fe" },
  "WDT - Rent / Office": { icon: Home, color: "#a855f7", bg: "#f3e8ff" },
  "WDT - Miscellaneous": { icon: Box, color: "#6b7280", bg: "#f3f4f6" },

  // Client Categories
  "Client Expenses - Accommodation": { icon: Hotel, color: "#8b5cf6", bg: "#ede9fe" },
  "Client Expenses - Meals": { icon: Utensils, color: "#ec4899", bg: "#fce7f3" },
  "Client Expenses - Entertainment": { icon: Sparkles, color: "#f59e0b", bg: "#fef3c7" },
  "Client Expenses - Transport": { icon: Car, color: "#3b82f6", bg: "#dbeafe" },
  "Client Expenses - Miscellaneous": { icon: Box, color: "#6b7280", bg: "#f3f4f6" },
};

export function getCategoryIcon(category) {
  return CATEGORY_ICONS[category] || { icon: Box, color: "#6b7280", bg: "#f3f4f6" };
}