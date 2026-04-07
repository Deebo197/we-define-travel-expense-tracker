import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { formatCurrency, formatDateUK, getClientName } from "@/lib/constants";

export default function Reimbursements() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("pending");

  const { data: expenses = [], isLoading: loadingExp } = useQuery({
    queryKey: ["allExpenses"],
    queryFn: () => base44.entities.Expense.list("-date", 500),
  });

  const { data: mileage = [], isLoading: loadingMil } = useQuery({
    queryKey: ["allMileage"],
    queryFn: () => base44.entities.MileageJourney.list("-date", 500),
  });

  const togglePaid = useMutation({
    mutationFn: async ({ type, id, paid }) => {
      if (type === "expense") {
        await base44.entities.Expense.update(id, { reimbursement_paid: paid });
      } else {
        await base44.entities.MileageJourney.update(id, { reimbursement_paid: paid });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allExpenses"] });
      queryClient.invalidateQueries({ queryKey: ["allMileage"] });
    },
  });

  // Combine expenses and mileage that need reimbursement
  const allItems = useMemo(() => {
    const expItems = expenses
      .filter(e => e.reimbursement_required)
      .map(e => ({ ...e, type: "Expense", person: e.submitted_by_name || e.submitted_by }));
    const milItems = mileage
      .filter(m => m.reimbursement_required)
      .map(m => ({ ...m, type: "Mileage", person: m.staff_member_name || m.staff_member, paid_amount: m.total_cost }));
    return [...expItems, ...milItems].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [expenses, mileage]);

  const filtered = allItems.filter(item => {
    if (filter === "pending") return !item.reimbursement_paid;
    if (filter === "paid") return item.reimbursement_paid;
    return true;
  });

  // Group by person
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(item => {
      const name = item.person || "Unknown";
      if (!map[name]) map[name] = [];
      map[name].push(item);
    });
    return map;
  }, [filtered]);

  const isLoading = loadingExp || loadingMil;

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Reimbursements</h1>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-32 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">No reimbursements found</p>
          <p className="text-sm mt-1">All clear!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([person, items]) => {
            const total = items.reduce((s, i) => s + (i.paid_amount || 0), 0);
            return (
              <div key={person} className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 bg-muted/30 border-b border-border">
                  <h3 className="font-semibold">{person}</h3>
                  <span className="text-lg font-bold text-primary">{formatCurrency(total)}</span>
                </div>
                <div className="divide-y divide-border">
                  {items.map(item => (
                    <div key={item.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{formatDateUK(item.date)}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{item.type}</span>
                        </div>
                        <p className="text-sm text-muted-foreground truncate mt-0.5">
                          {item.description || item.purpose}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.client_allocations?.map(a => a.client_code).join(", ")}
                        </p>
                      </div>
                      <span className="text-sm font-semibold whitespace-nowrap">{formatCurrency(item.paid_amount)}</span>
                      <Switch
                        checked={!!item.reimbursement_paid}
                        onCheckedChange={(v) => togglePaid.mutate({
                          type: item.type === "Expense" ? "expense" : "mileage",
                          id: item.id,
                          paid: v,
                        })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}