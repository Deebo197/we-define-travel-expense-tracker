import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Loader2 } from "lucide-react";
import ReceiptCapture from "../components/ReceiptCapture";
import ClientSplitInput from "../components/ClientSplitInput";
import CategorySelectItem from "../components/CategorySelectItem";
import PersonAvatar from "../components/PersonAvatar";
import { PAID_BY_CODES, formatMonth, isReimbursementRequired, formatCurrency, getCategoriesForClient } from "@/lib/constants";
import { generateReceiptCode } from "@/lib/receiptCodeGenerator";

export default function SubmitExpense() {
  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    description: "",
    paid_amount: "",
    actual_cost: "",
    vat: false,
    paid_by: "",
    category: "",
    receipt_file: "",
    receipt_url: "",
    client_allocations: [{ client_code: "", client_name: "", percentage: 100, amount: 0 }],
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  // Pre-fill paid_by with user's code
  const userPaidByCode = user?.paid_by_code || "";
  if (!form.paid_by && userPaidByCode) {
    setForm(f => ({ ...f, paid_by: userPaidByCode }));
  }

  const updateField = (field, value) => {
    setForm(f => {
      const updated = { ...f, [field]: value };
      // If paid_amount changes, recalc allocations
      if (field === "paid_amount") {
        const amt = parseFloat(value) || 0;
        updated.client_allocations = f.client_allocations.map(a => ({
          ...a,
          amount: Math.round((amt * (a.percentage || 0) / 100) * 100) / 100,
        }));
        updated.actual_cost = value;
      }
      return updated;
    });
  };

  const handleOCR = (data) => {
    setForm(f => ({
      ...f,
      date: data.date || f.date,
      description: data.description || f.description,
      paid_amount: data.amount || f.paid_amount,
      actual_cost: data.amount || f.actual_cost,
      client_allocations: f.client_allocations.map(a => ({
        ...a,
        amount: Math.round(((data.amount || f.paid_amount || 0) * (a.percentage || 0) / 100) * 100) / 100,
      })),
    }));
  };

  const handleAllocationsChange = (allocations) => {
    setForm(f => {
      // Reset category if primary client changes
      const newPrimary = allocations[0]?.client_code;
      const oldPrimary = f.client_allocations[0]?.client_code;
      const category = newPrimary !== oldPrimary ? "" : f.category;
      return { ...f, client_allocations: allocations, category };
    });
  };

  const primaryClient = form.client_allocations[0]?.client_code;
  const categories = primaryClient ? getCategoriesForClient(primaryClient) : [];

  const totalPct = form.client_allocations.reduce((s, a) => s + (a.percentage || 0), 0);
  const canSubmit = form.date && form.description && form.paid_amount && form.paid_by
    && form.client_allocations.length > 0
    && form.client_allocations.every(a => a.client_code)
    && Math.abs(totalPct - 100) < 0.01;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);

    const primaryClient = form.client_allocations[0].client_code;
    const receiptCode = await generateReceiptCode(primaryClient, form.date);
    const dateObj = new Date(form.date);
    const month = formatMonth(form.date);
    const year = dateObj.getFullYear();

    const expense = {
      date: form.date,
      description: form.description,
      paid_amount: parseFloat(form.paid_amount),
      actual_cost: parseFloat(form.actual_cost) || parseFloat(form.paid_amount),
      vat: form.vat,
      paid_by: form.paid_by,
      category: form.category || "",
      receipt_file: form.receipt_file,
      receipt_url: form.receipt_file,
      client_allocations: form.client_allocations,
      receipt_code: receiptCode,
      reimbursement_required: isReimbursementRequired(form.paid_by),
      reimbursement_paid: false,
      month,
      year,
      submitted_by: user?.email,
      submitted_by_name: user?.full_name,
      source: "manual",
    };

    await base44.entities.Expense.create(expense);
    setSuccess(receiptCode);
    setSubmitting(false);
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold mb-2">Expense Submitted</h2>
        <p className="text-muted-foreground mb-1">Receipt Code</p>
        <p className="text-2xl font-bold text-primary mb-6">{success}</p>
        <Button onClick={() => { setSuccess(null); setForm({ date: new Date().toISOString().split("T")[0], description: "", paid_amount: "", actual_cost: "", vat: false, paid_by: userPaidByCode, category: "", receipt_file: "", receipt_url: "", client_allocations: [{ client_code: "", client_name: "", percentage: 100, amount: 0 }] }); }}>
          Submit Another
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Submit Expense</h1>
      
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Receipt Capture */}
        <ReceiptCapture
          onFileUploaded={(url) => updateField("receipt_file", url)}
          onOCRComplete={handleOCR}
          receiptUrl={form.receipt_file}
        />

        {/* Date */}
        <div>
          <Label className="text-sm font-medium">Date *</Label>
          <Input
            type="date"
            value={form.date}
            onChange={(e) => updateField("date", e.target.value)}
            className="mt-1.5"
            required
          />
        </div>

        {/* Description */}
        <div>
          <Label className="text-sm font-medium">Description *</Label>
          <Textarea
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder="e.g. add details of the reason for the expense"
            className="mt-1.5"
            rows={3}
            required
          />
        </div>

        {/* Amount */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-sm font-medium">Paid Amount £ *</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.paid_amount}
              onChange={(e) => updateField("paid_amount", e.target.value)}
              className="mt-1.5"
              placeholder="0.00"
              required
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Actual Cost £</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.actual_cost}
              onChange={(e) => updateField("actual_cost", e.target.value)}
              className="mt-1.5"
              placeholder="0.00"
            />
          </div>
        </div>

        {/* VAT */}
        <div className="flex items-center gap-3">
          <Switch checked={form.vat} onCheckedChange={(v) => updateField("vat", v)} />
          <Label className="text-sm">VAT applicable</Label>
        </div>

        {/* Paid By */}
        <div>
          <Label className="text-sm font-medium">Paid By *</Label>
          <Select value={form.paid_by} onValueChange={(v) => updateField("paid_by", v)}>
            <SelectTrigger className="mt-1.5">
              {form.paid_by ? (
                <div className="flex items-center gap-2">
                  <PersonAvatar code={form.paid_by} size="xs" />
                  <span>{PAID_BY_CODES.find(p => p.code === form.paid_by)?.label}</span>
                </div>
              ) : (
                <SelectValue placeholder="Select who paid" />
              )}
            </SelectTrigger>
            <SelectContent>
              {PAID_BY_CODES.map(p => (
                <SelectItem key={p.code} value={p.code}>
                  {p.code} — {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isReimbursementRequired(form.paid_by) && (
            <p className="text-xs text-primary font-medium mt-1">⚠ Reimbursement will be required</p>
          )}
        </div>

        {/* Client Split */}
        <div className="border-t border-border pt-5">
          <Label className="text-sm font-semibold mb-3 block">Client Allocation</Label>
          <ClientSplitInput
            allocations={form.client_allocations}
            onChange={handleAllocationsChange}
            paidAmount={parseFloat(form.paid_amount) || 0}
          />
        </div>

        {/* Category */}
        {primaryClient && (
          <div>
            <Label className="text-sm font-medium">Category *</Label>
            <Select value={form.category} onValueChange={v => updateField("category", v)}>
              <SelectTrigger className="mt-1.5">
               <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
               {categories.map(c => (
                 <CategorySelectItem key={c} category={c} />
               ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Submit */}
        <Button type="submit" className="w-full h-11" disabled={!canSubmit || submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Submit Expense
        </Button>
      </form>
    </div>
  );
}