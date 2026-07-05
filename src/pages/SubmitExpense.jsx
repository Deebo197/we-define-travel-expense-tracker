import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import AnimatedPage from "@/components/AnimatedPage";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import MultiFileAttachment from "../components/MultiFileAttachment";
import ClientSplitInput from "../components/ClientSplitInput";
import CategorySelectItem from "../components/CategorySelectItem";
import PersonAvatar from "../components/PersonAvatar";
import { PAID_BY_CODES, formatMonth, isReimbursementRequired, formatCurrency, getCategoriesForClient } from "@/lib/constants";
import { toast } from "sonner";
import CurrencySelector from "../components/CurrencySelector";
import { generateReceiptCode } from "@/lib/receiptCodeGenerator";

export default function SubmitExpense() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const draftId = urlParams.get('draft_id') || null;

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const { data: draftExpense } = useQuery({
    queryKey: ["draftExpense", draftId],
    queryFn: () => base44.entities.Expense.filter({ id: draftId }),
    enabled: !!draftId,
    select: (data) => data?.[0] || null,
  });

  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    invoice_date: "",
    description: "",
    paid_amount: "",
    actual_cost: "",
    vat: false,
    paid_by: "",
    category: "",
    receipt_file: "",
    receipt_url: "",
    receipt_files: [],
    currency: "GBP",
    original_amount: "",
    exchange_rate: null,
    client_allocations: [{ client_code: "", client_name: "", percentage: 100, amount: 0 }],
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  // Pre-fill from draft if available
  useEffect(() => {
    if (draftExpense) {
      setForm(f => ({
        ...f,
        date: draftExpense.date || f.date,
        description: draftExpense.description || f.description,
        paid_amount: draftExpense.paid_amount || f.paid_amount,
        actual_cost: draftExpense.actual_cost || draftExpense.paid_amount || f.actual_cost,
        vat: draftExpense.vat || false,
        receipt_file: draftExpense.receipt_file || f.receipt_file,
        receipt_url: draftExpense.receipt_url || f.receipt_url,
        receipt_files: draftExpense.receipt_files || f.receipt_files,
      }));
    }
  }, [draftExpense]);

  // Pre-fill paid_by with user's code
  const userPaidByCode = user?.paid_by_code || "";
  useEffect(() => {
    if (!form.paid_by && userPaidByCode) {
      setForm(f => ({ ...f, paid_by: userPaidByCode }));
    }
  }, [userPaidByCode]);

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
    // Only accept OCR date if it's a valid YYYY-MM-DD string; otherwise keep
    // today's date (the form default) instead of a garbage/random extracted value.
    const isValidDate = (d) => {
      if (!d || typeof d !== "string") return false;
      const parsed = new Date(d);
      return !isNaN(parsed.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(d);
    };

    setForm(f => ({
      ...f,
      date: isValidDate(data.date) ? data.date : f.date,
      description: data.description || f.description,
      paid_amount: data.amount || f.paid_amount,
      actual_cost: data.amount || f.actual_cost,
      client_allocations: f.client_allocations.map(a => ({
        ...a,
        amount: Math.round(((data.amount || f.paid_amount || 0) * (a.percentage || 0) / 100) * 100) / 100,
      })),
    }));
  };

  const handleFilesChange = (files) => {
    const primaryFile = files.find(f => f.role === "primary");
    setForm(f => ({
      ...f,
      receipt_files: files,
      receipt_file: primaryFile?.file_url || f.receipt_file,
      receipt_url: primaryFile?.file_url || f.receipt_url,
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

  const totalAllocated = form.client_allocations.reduce((s, a) => s + (a.amount || 0), 0);
  const paidAmt = parseFloat(form.paid_amount) || 0;
  const canSubmit = form.date && form.description && form.paid_amount && form.paid_by
    && form.client_allocations.length > 0
    && form.client_allocations.every(a => a.client_code)
    && Math.abs(totalAllocated - paidAmt) < 0.01;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const receiptCode = await generateReceiptCode(form.date);
      const dateObj = new Date(form.date);
      const month = formatMonth(form.date);
      const year = dateObj.getFullYear();

      const primaryFile = form.receipt_files.find(f => f.role === "primary");
      const primaryUrl = primaryFile?.file_url || form.receipt_file;

      const expense = {
        date: form.date,
        invoice_date: form.invoice_date || null,
        description: form.description,
        paid_amount: parseFloat(form.paid_amount),
        actual_cost: parseFloat(form.actual_cost) || parseFloat(form.paid_amount),
        vat: form.vat,
        paid_by: form.paid_by,
        category: form.category || "",
        receipt_file: primaryUrl,
        receipt_url: primaryUrl,
        primary_receipt_file_url: primaryUrl,
        receipt_files: form.receipt_files.length > 0 ? form.receipt_files : undefined,
        client_allocations: form.client_allocations,
        receipt_code: receiptCode,
        reimbursement_required: isReimbursementRequired(form.paid_by),
        reimbursement_paid: false,
        month,
        year,
        submitted_by: user?.email,
        submitted_by_name: user?.full_name,
        source: "manual",
        currency: form.currency || "GBP",
        original_amount: form.currency !== "GBP" ? parseFloat(form.original_amount) || null : null,
        exchange_rate: form.currency !== "GBP" ? form.exchange_rate || null : null,
      };

      if (draftId) {
        await base44.entities.Expense.update(draftId, { ...expense, status: 'confirmed' });
      } else {
        await base44.entities.Expense.create(expense);
      }
      queryClient.invalidateQueries({ queryKey: ["myExpenses"] });
      queryClient.invalidateQueries({ queryKey: ["allExpenses"] });
      setSuccess(receiptCode);
    } catch (err) {
      toast.error(err.message || "Failed to submit expense. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-md mx-auto text-center py-16"
      >
        <motion.div
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.15, duration: 0.5, type: "spring", stiffness: 200, damping: 14 }}
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ background: "linear-gradient(135deg, rgba(61,220,151,0.2), rgba(61,220,151,0.1))", border: "1px solid rgba(61,220,151,0.3)" }}
        >
          <CheckCircle2 className="h-10 w-10" style={{ color: "#3DDC97" }} />
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.35 }}
          className="text-2xl font-semibold mb-2"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.02em" }}
        >
          Expense Submitted
        </motion.h2>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.35 }}
        >
          <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>Receipt Code</p>
          <p className="text-3xl font-bold tabular-nums mb-8" style={{ color: "#7F5BFF", letterSpacing: "-0.02em" }}>{success}</p>
          <Button onClick={() => { setSuccess(null); setForm({ date: new Date().toISOString().split("T")[0], description: "", paid_amount: "", actual_cost: "", vat: false, paid_by: userPaidByCode, category: "", receipt_file: "", receipt_url: "", receipt_files: [], currency: "GBP", original_amount: "", exchange_rate: null, client_allocations: [{ client_code: "", client_name: "", percentage: 100, amount: 0 }] }); }}>
            Submit Another
          </Button>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <AnimatedPage>
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">
        {draftId ? 'Review & Confirm Expense' : 'Submit Expense'}
      </h1>
      {draftId && (
        <div className="mb-5 flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
          This expense was extracted from an email. Please review all fields, assign a client allocation and category, then submit.
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Receipt Files */}
        <div>
          <Label className="text-sm font-medium mb-2 block">Receipt Files</Label>
          <MultiFileAttachment
            files={form.receipt_files}
            onChange={handleFilesChange}
            onOCRComplete={handleOCR}
          />
        </div>

        {/* Date + Invoice Date */}
        <div className="grid grid-cols-2 gap-3">
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
          <div>
            <Label className="text-sm font-medium">Invoice Date <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
            <Input
              type="date"
              value={form.invoice_date || ""}
              onChange={(e) => updateField("invoice_date", e.target.value || "")}
              className="mt-1.5"
            />
            <p className="text-xs text-muted-foreground mt-1">Override invoice period</p>
          </div>
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

        {/* Currency */}
        <CurrencySelector
          currency={form.currency}
          originalAmount={form.original_amount}
          exchangeRate={form.exchange_rate}
          onCurrencyChange={(v) => setForm(f => ({ ...f, currency: v }))}
          onOriginalAmountChange={(v) => setForm(f => ({ ...f, original_amount: v }))}
          onExchangeRateChange={(v) => setForm(f => ({ ...f, exchange_rate: v }))}
          onGbpAmountChange={(gbp) => {
            setForm(f => ({
              ...f,
              paid_amount: gbp,
              actual_cost: gbp,
              client_allocations: f.client_allocations.map(a => ({
                ...a,
                amount: Math.round((gbp * (a.percentage || 0) / 100) * 100) / 100,
              })),
            }));
          }}
        />

        {/* Amount */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-sm font-medium">
              {form.currency && form.currency !== "GBP" ? "Converted Amount £ (GBP) *" : "Paid Amount £ *"}
            </Label>
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
        <motion.div
          whileTap={{ scale: 0.98 }}
          whileHover={{ scale: canSubmit && !submitting ? 1.01 : 1 }}
          transition={{ duration: 0.15 }}
        >
          <Button type="submit" className="w-full h-11" disabled={!canSubmit || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Submit Expense
          </Button>
        </motion.div>
      </form>
    </div>
    </AnimatedPage>
  );
}