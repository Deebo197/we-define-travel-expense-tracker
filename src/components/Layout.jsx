import { Outlet, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import { useState, useEffect } from "react";

export default function Layout() {
  const navigate = useNavigate();

  useEffect(() => {
    window.history.pushState(null, "", window.location.href);
    const handlePop = () => {
      window.history.pushState(null, "", window.location.href);
      navigate("/submit-expense", { replace: true });
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [navigate]);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar — desktop only */}
      <div className="hidden lg:block w-64 flex-shrink-0">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-center px-4 py-3 border-b border-border bg-card">
          <img src="https://media.base44.com/images/public/69d4e29f22a8078c11a10f41/b0e92e42e_repevologo.png"

          alt="We Define Travel" className="h-8 w-auto object-contain" />

          
        </div>

        <main className="p-4 md:p-6 lg:p-8 max-w-7xl pb-28 lg:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Fixed bottom nav — mobile only */}
      <div className="lg:hidden">
        <BottomNav />
      </div>
    </div>);

}