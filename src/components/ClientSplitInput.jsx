import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Divide } from "lucide-react";
import { CLIENT_CODES, formatCurrency } from "@/lib/constants";

export default function ClientSplitInput({ allocations, onChange, paidAmount }) {
  const [splitMode, setSplitMode] = useState(allocations.length > 1);
  const [inputMode, setInputMode] = useState("percentage"); // "percentage" | "amount"

  const handleToggleSplit = (checked) => {
    setSplitMode(checked);
    if (!checked && allocations.length > 0) {
      onChange([{ ...allocations[0], percentage: 100, amount: paidAmount || 0 }]);
    } else if (checked && allocations.length === 1) {
      onChange([{ ...allocations[0] }]);
    }
  };

  const addClient = () => {
    const updated = [...allocations, { client_code: "", client_name: "", percentage: 0, amount: 0 }];
    // Auto-distribute equally so totals always sum to 100%
    const count = updated.length;
    const pct = Math.round((100 / count) * 100) / 100;
    updated.forEach((a, i) => {
      const actualPct = i === count - 1 ? 100 - (pct * (count - 1)) : pct;
      a.percentage = actualPct;
      a.amount = Math.round(((paidAmount || 0) * actualPct / 100) * 100) / 100;
    });
    onChange(updated);
  };

  const removeClient = (index) => {
    const updated = allocations.filter((_, i) => i !== index);
    onChange(updated);
  };

  const updateClient = (index, field, value) => {
    const updated = [...allocations];
    if (field === "client_code") {
      const client = CLIENT_CODES.find(c => c.code === value);
      updated[index] = { ...updated[index], client_code: value, client_name: client?.name || "" };
    } else if (field === "percentage") {
      const pct = parseFloat(value) || 0;
      updated[index] = { ...updated[index], percentage: pct, amount: Math.round(((paidAmount || 0) * pct / 100) * 100) / 100 };
    } else if (field === "amount") {
      const amt = parseFloat(value) || 0;
      const pct = paidAmount ? Math.round((amt / paidAmount * 100) * 100) / 100 : 0;
      updated[index] = { ...updated[index], amount: amt, percentage: pct };
    }
    onChange(updated);
  };

  const splitEqually = () => {
    const count = allocations.length;
    if (count === 0) return;
    const pct = Math.round((100 / count) * 100) / 100;
    const updated = allocations.map((a, i) => {
      const actualPct = i === count - 1 ? 100 - (pct * (count - 1)) : pct;
      return { ...a, percentage: actualPct, amount: Math.round(((paidAmount || 0) * actualPct / 100) * 100) / 100 };
    });
    onChange(updated);
  };

  const totalPct = allocations.reduce((sum, a) => sum + (a.percentage || 0), 0);
  const totalAmount = allocations.reduce((sum, a) => sum + (a.amount || 0), 0);
  const isValid = inputMode === "percentage"
    ? Math.abs(totalPct - 100) < 0.01
    : paidAmount ? Math.abs(totalAmount - paidAmount) < 0.01 : Math.abs(totalPct - 100) < 0.01;

  // Single client mode
  if (!splitMode) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch checked={splitMode} onCheckedChange={handleToggleSplit} />
          <Label className="text-sm">Split across clients</Label>
        </div>
        <div>
          <Label className="text-sm font-medium">Client *</Label>
          <Select
            value={allocations[0]?.client_code || ""}
            onValueChange={(v) => {
              const client = CLIENT_CODES.find(c => c.code === v);
              onChange([{ client_code: v, client_name: client?.name || "", percentage: 100, amount: paidAmount || 0 }]);
            }}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder="Select client" />
            </SelectTrigger>
            <SelectContent>
              {CLIENT_CODES.map(c => (
                <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Switch checked={splitMode} onCheckedChange={handleToggleSplit} />
          <Label className="text-sm">Split across clients</Label>
        </div>
        <div className="flex gap-2">
          {/* % / £ toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
            <button
              type="button"
              onClick={() => setInputMode("percentage")}
              className={`px-3 py-1.5 transition-colors ${inputMode === "percentage" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}
            >%</button>
            <button
              type="button"
              onClick={() => setInputMode("amount")}
              className={`px-3 py-1.5 transition-colors ${inputMode === "amount" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}
            >£</button>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={splitEqually} disabled={allocations.length < 2}>
            <Divide className="h-3 w-3 mr-1" /> Equal split
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={addClient}>
            <Plus className="h-3 w-3 mr-1" /> Add client
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {allocations.map((alloc, i) => (
          <div key={i} className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <Select
              value={alloc.client_code}
              onValueChange={(v) => updateClient(i, "client_code", v)}
            >
              <SelectTrigger className="flex-1 min-w-0 bg-background">
                <SelectValue placeholder="Client" />
              </SelectTrigger>
              <SelectContent>
                {CLIENT_CODES.map(c => (
                  <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {inputMode === "percentage" ? (
              <>
                <div className="flex items-center gap-1 w-24">
                  <Input
                    type="number"
                    value={alloc.percentage || ""}
                    onChange={(e) => updateClient(i, "percentage", e.target.value)}
                    className="w-16 text-center bg-background"
                    min="0" max="100" step="0.01"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <span className="text-sm font-medium w-20 text-right">{formatCurrency(alloc.amount)}</span>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1 w-28">
                  <span className="text-sm text-muted-foreground">£</span>
                  <Input
                    type="number"
                    value={alloc.amount || ""}
                    onChange={(e) => updateClient(i, "amount", e.target.value)}
                    className="w-20 text-center bg-background"
                    min="0" step="0.01"
                  />
                </div>
                <span className="text-sm text-muted-foreground w-16 text-right">{alloc.percentage?.toFixed(1)}%</span>
              </>
            )}
            {allocations.length > 1 && (
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => removeClient(i)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* Running total */}
      <div className={`flex justify-between text-sm px-3 py-2 rounded-lg ${isValid ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
        <span>Total: {formatCurrency(totalAmount)} — {totalPct.toFixed(1)}%</span>
        {!isValid && (
          <span className="font-medium">
            {inputMode === "amount" && paidAmount
              ? `${formatCurrency(paidAmount - totalAmount)} remaining`
              : `${(100 - totalPct).toFixed(1)}% remaining`}
          </span>
        )}
      </div>
    </div>
  );
}