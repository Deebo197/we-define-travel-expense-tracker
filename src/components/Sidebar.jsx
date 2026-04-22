import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, PlusCircle, Receipt, List,
  CreditCard, FileText, MapPin, Building2, X, LogOut } from
"lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import ProfileCodePicker from "@/components/ProfileCodePicker";

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
  const filteredNav = navItems.filter((item) => !item.adminOnly || isAdmin || isLoadingAuth);
  const getHomePath = () => isAdmin ? "/" : "/submit-expense";

  return (
    <div
      className="h-full flex flex-col"
      style={{ backgroundColor: "#14141B", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
      
      {/* Logo */}
      <div className="p-5 flex items-center justify-between">
        <Link to={getHomePath()} className="flex items-center gap-3" onClick={onClose}>
          <img src="https://media.base44.com/images/public/69d4e29f22a8078c11a10f41/1b93c4387_repevo_transparent.png"

          alt="We Define Travel" className="h-16 w-auto object-contain" />

          
        </Link>
        <button
          onClick={onClose}
          className="lg:hidden p-2 rounded-xl transition-colors"
          style={{ color: "#A1A1B5" }}>
          
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
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.98]"
              style={
              isActive ?
              {
                background: "linear-gradient(135deg, #7F5BFF 0%, #6F3BFF 50%, #3A1DFF 100%)",
                color: "#FFFFFF",
                boxShadow: "0 4px 16px rgba(127,91,255,0.3)"
              } :
              {
                color: "#6C6C80"
              }
              }
              onMouseEnter={(e) => {if (!isActive) {e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)";e.currentTarget.style.color = "#A1A1B5";}}}
              onMouseLeave={(e) => {if (!isActive) {e.currentTarget.style.backgroundColor = "transparent";e.currentTarget.style.color = "#6C6C80";}}}>
              
              <Icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </Link>);

        })}
      </nav>

      {/* User info */}
      <div className="p-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #7F5BFF 0%, #3A1DFF 100%)" }}>
            
            {user?.full_name?.charAt(0) || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate text-white">{user?.full_name || "Loading..."}</div>
            <div className="text-[11px]" style={{ color: "#6C6C80" }}>
              {user?.role === "admin" ? "Admin" : "Team Member"}
            </div>
          </div>
          <ProfileCodePicker currentCode={user?.paid_by_code} />
          <button
            onClick={() => base44.auth.logout()}
            className="p-2 rounded-xl transition-all duration-200 active:scale-95"
            style={{ color: "#6C6C80" }}
            title="Sign out"
            onMouseEnter={(e) => {e.currentTarget.style.color = "#FF5C7A";e.currentTarget.style.backgroundColor = "rgba(255,92,122,0.1)";}}
            onMouseLeave={(e) => {e.currentTarget.style.color = "#6C6C80";e.currentTarget.style.backgroundColor = "transparent";}}>
            
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>);

}