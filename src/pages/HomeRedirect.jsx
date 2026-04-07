import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Navigate } from "react-router-dom";

export default function HomeRedirect() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (user?.role === "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/submit-expense" replace />;
}