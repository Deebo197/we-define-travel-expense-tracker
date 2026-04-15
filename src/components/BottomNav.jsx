import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, PlusCircle, Receipt, List,
  CreditCard, FileText, MapPin, Building2
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

const navItems = [
  { path: "/dashboard",      label: "Dashboard",      icon: LayoutDashboard, adminOnly: true },
  { path: "/submit-expense", label: "Submit",          icon: PlusCircle,      adminOnly: false },
  { path: "/my-expenses",    label: "My Expenses",     icon: Receipt,         adminOnly: false },
  { path: "/all-expenses",   label: "All Expenses",    icon: List,            adminOnly: true },
  { path: "/reimbursements", label: "Reimburse",       icon: CreditCard,      adminOnly: true },
  { path: "/client-report",  label: "Client Report",   icon: FileText,        adminOnly: true },
  { path: "/mileage-log",    label: "Mileage",         icon: MapPin,          adminOnly: false },
  { path: "/accounts",       label: "Accounts",        icon: Building2,       adminOnly: true },
];

export default function BottomNav() {
  const location = useLocation();
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === "admin";

  const visibleItems = navItems.filter(item => !item.adminOnly || isAdmin || isLoadingAuth);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-lg">
      <div className="overflow-x-auto scrollbar-none">
        <div className="flex items-stretch" style={{ minWidth: "max-content" }}>
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  flex flex-col items-center justify-center gap-1 px-4 py-3 min-w-[72px]
                  text-xs font-medium transition-colors
                  ${isActive
                    ? "text-primary border-t-2 border-primary bg-primary/5"
                    : "text-muted-foreground border-t-2 border-transparent hover:text-foreground hover:bg-accent"}
                `}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}