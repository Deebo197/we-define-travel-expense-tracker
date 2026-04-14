import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, PlusCircle, Receipt, List,
  CreditCard, FileText, MapPin, Building2, X, LogOut } from
"lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";

const navItems = [
{ path: "/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
{ path: "/submit-expense", label: "Submit Expense", icon: PlusCircle, adminOnly: false },
{ path: "/my-expenses", label: "My Expenses", icon: Receipt, adminOnly: false },
{ path: "/all-expenses", label: "All Expenses", icon: List, adminOnly: true },
{ path: "/reimbursements", label: "Reimbursements", icon: CreditCard, adminOnly: true },
{ path: "/client-report", label: "Client Report", icon: FileText, adminOnly: true },
{ path: "/mileage-log", label: "Mileage Log", icon: MapPin, adminOnly: false },
{ path: "/accounts", label: "Accounts", icon: Building2, adminOnly: true }];


export default function Sidebar({ onClose }) {
  const location = useLocation();
  const { user, isLoadingAuth } = useAuth();

  const isAdmin = user?.role === "admin";

  // While auth is loading, show all items (AdminRoute handles actual access control)
  const filteredNav = navItems.filter((item) => !item.adminOnly || isAdmin || isLoadingAuth);

  // For non-admin, default route is submit-expense
  const getHomePath = () => isAdmin ? "/" : "/submit-expense";

  return (
    <div className="h-full bg-card border-r border-border flex flex-col">
      {/* Logo */}
      <div className="p-5 flex items-center justify-between">
        <Link to={getHomePath()} className="flex items-center gap-3" onClick={onClose}>
          <img src="https://media.base44.com/images/public/69d4e29f22a8078c11a10f41/2f2822c71_Screenshot_2026-04-14_at_175952.png"

          alt="We Define Travel" className="h-5 w-auto object-contain" />

          
        </Link>
        <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {filteredNav.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150
                ${isActive ?
              "bg-primary text-primary-foreground shadow-sm" :
              "text-muted-foreground hover:bg-accent hover:text-foreground"}
              `
              }>
              
              <Icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </Link>);

        })}
      </nav>

      {/* User info */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-primary font-semibold text-xs">
              {user?.full_name?.charAt(0) || "?"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user?.full_name || "Loading..."}</div>
            <div className="text-[11px] text-muted-foreground capitalize">
              {user?.role === "admin" ? "Admin" : "Team Member"}
            </div>
          </div>
          <button
            onClick={() => base44.auth.logout()}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Sign out">
            
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>);

}