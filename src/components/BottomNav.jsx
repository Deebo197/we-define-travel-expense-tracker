import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, PlusCircle, Receipt, List,
  CreditCard, FileText, MapPin, Building2
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

const navItems = [
  { path: "/dashboard",      label: "Dashboard",    icon: LayoutDashboard, adminOnly: true },
  { path: "/submit-expense", label: "Submit",       icon: PlusCircle,      adminOnly: false },
  { path: "/my-expenses",    label: "My Expenses",  icon: Receipt,         adminOnly: false },
  { path: "/all-expenses",   label: "All",          icon: List,            adminOnly: true },
  { path: "/reimbursements", label: "Reimburse",    icon: CreditCard,      adminOnly: true },
  { path: "/client-report",  label: "Reports",      icon: FileText,        adminOnly: true },
  { path: "/mileage-log",    label: "Mileage",      icon: MapPin,          adminOnly: false },
  { path: "/accounts",       label: "Accounts",     icon: Building2,       adminOnly: true },
];

export default function BottomNav() {
  const location = useLocation();
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === "admin";
  const visibleItems = navItems.filter(item => !item.adminOnly || isAdmin || isLoadingAuth);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        backgroundColor: "#14141B",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.4)",
      }}
    >
      <div className="overflow-x-auto scrollbar-none">
        <div className="flex items-stretch" style={{ minWidth: "max-content" }}>
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex flex-col items-center justify-center gap-1 px-4 py-3 min-w-[72px] transition-all duration-200 active:scale-95"
                style={{
                  color: isActive ? "#7F5BFF" : "#6C6C80",
                  borderTop: isActive ? "2px solid #7F5BFF" : "2px solid transparent",
                  backgroundColor: isActive ? "rgba(127,91,255,0.06)" : "transparent",
                }}
              >
                <Icon className="h-5 w-5 flex-shrink-0" strokeWidth={1.75} />
                <span className="whitespace-nowrap text-[11px] font-semibold tracking-widest uppercase">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}