import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ExternalLink, CheckCircle2, Trash2, Pencil, AlertTriangle, Copy } from "lucide-react";
import ReimbursementBadge from "../components/ReimbursementBadge";
import CategoryBadge from "../components/CategoryBadge";
import PersonAvatar from "../components/PersonAvatar";
import EditExpenseDialog from "../components/EditExpenseDialog";
import DuplicateToWD1Dialog from "../components/DuplicateToWD1Dialog";
import { CLIENT_CODES, PAID_BY_CODES, formatCurrency, formatForeignCurrency, formatDateUK, getClientName } from "@/lib/constants";
import AnimatedPage from "@/components/AnimatedPage";
import { toast } from "sonner";

export default function AllExpenses() {
  const queryClient = useQueryClient();
  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["allExpenses"],
    queryFn: () => base44.entities.Expense.list("-date", 500),
  });

  const [descAliases] = useState(() => {
    try { return JSON.parse(localStorage.getItem("wdt_desc_aliases") || "{}"); } catch { return {}; }
  });

  const getDisplayDescription = (desc) => descAliases[desc] || desc;

  const [filters, setFilters] = useState({ client: "all", month: "all", paidBy: "all", reimbReq: "all", reimbPaid: "all" });
  const [selected, setSelected] = useState(null);
  const [checked, setChecked] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [editExpense, setEditExpense] = useState(null);
  const [duplicateExpense, setDuplicateExpense] = useState(null);
  const [receiptMenu, setReceiptMenu] = useState(null); // { exp, x, y }
  const menuRef = useRef(null);

  useEffect(() => {
    if (!receiptMenu) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setReceiptMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [receiptMenu]);

  const markPaid = useMutation({
    mutationFn: async (ids) => {
      for (const id of ids) {
        await base44.entities.Expense.update(id, { reimbursement_paid: true });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allExpenses"] });
      setChecked([]);
    },
    onError: (err) => toast.error(err.message || "Failed to mark as paid"),
  });

  const deleteExpenses = useMutation({
    mutationFn: async (ids) => {
      for (const id of ids) {
        await base44.entities.Expense.delete(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allExpenses"] });
      setSelectedIds([]);
      setChecked([]);
    },
    onError: (err) => toast.error(err.message || "Failed to delete expenses"),
  });

  const toggleSelectId = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const openDuplicate = (ids) => {
    // For single selection open dialog; for multiple still confirm-and-batch
    if (ids.length === 1) {
      setDuplicateExpense(expenses.find(e => e.id === ids[0]));
    } else {
      // multi: open dialog for first, user can review each one — or just batch directly
      if (confirm(`Duplicate ${ids.length} expense(s) to WD1 (admin only, no review)?`)) {
        Promise.all(ids.map(async id => {
          const exp = expenses.find(e => e.id === id);
          if (!exp) return;
          const { id: _id, created_date, updated_date, created_by_id, drive_sync_failed, receipt_code, ...rest } = exp;
          const codeRes = await base44.functions.invoke("generateReceiptCode", { date: exp.date });
          await base44.entities.Expense.create({ ...rest, paid_by: "WD1", is_admin_only_duplicate: true, drive_sync_failed: false, receipt_code: codeRes.data?.receipt_code || "" });
        })).then(() => {
          queryClient.invalidateQueries({ queryKey: ["allExpenses"] });
          setSelectedIds([]);
          toast.success(`Duplicated ${ids.length} expenses to WD1`);
        }).catch(err => toast.error(err.message || "Failed to duplicate"));
      }
    }
  };

  const months = [...new Set(expenses.map(e => e.month || (e.date ? e.date.slice(0, 7) : null)))].filter(Boolean).sort().reverse();

  const filtered = expenses.filter(e => {
    if (filters.client !== "all" && !e.client_allocations?.some(a => a.client_code === filters.client)) return false;
    if (filters.month !== "all" && e.month !== filters.month) return false;
    if (filters.paidBy !== "all" && e.paid_by !== filters.paidBy) return false;
    if (filters.reimbReq !== "all" && String(e.reimbursement_required) !== filters.reimbReq) return false;
    if (filters.reimbPaid !== "all" && String(e.reimbursement_paid) !== filters.reimbPaid) return false;
    return true;
  });

  const toggleCheck = (id) => {
    setChecked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <AnimatedPage>
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">All Expenses</h1>
        <div className="flex gap-2">
        {selectedIds.length > 0 && (
          <>
            {selectedIds.length === 1 && (
              <Button size="sm" variant="outline" onClick={() => setEditExpense(expenses.find(e => e.id === selectedIds[0]))}>
                <Pencil className="h-4 w-4 mr-1" /> Edit
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => openDuplicate(selectedIds)}>
              <Copy className="h-4 w-4 mr-1" />
              Duplicate to WD1
            </Button>
            <Button size="sm" variant="destructive" onClick={() => { if (confirm(`Delete ${selectedIds.length} expense(s)?`)) deleteExpenses.mutate(selectedIds); }} disabled={deleteExpenses.isPending}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete {selectedIds.length}
            </Button>
          </>
        )}
        {checked.length > 0 && (
          <Button size="sm" onClick={() => markPaid.mutate(checked)} disabled={markPaid.isPending}>
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Mark {checked.length} as Paid
          </Button>
        )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        <Select value={filters.client} onValueChange={v => setFilters(f => ({ ...f, client: v }))}>
          <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="Client" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {CLIENT_CODES.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.month} onValueChange={v => setFilters(f => ({ ...f, month: v }))}>
          <SelectTrigger className="w-32 h-9 text-xs"><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.paidBy} onValueChange={v => setFilters(f => ({ ...f, paidBy: v }))}>
          <SelectTrigger className="w-32 h-9 text-xs"><SelectValue placeholder="Paid By" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {PAID_BY_CODES.map(p => <SelectItem key={p.code} value={p.code}>{p.code}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.reimbReq} onValueChange={v => setFilters(f => ({ ...f, reimbReq: v }))}>
          <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="Reimb. Req" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Reimb: All</SelectItem>
            <SelectItem value="true">Required</SelectItem>
            <SelectItem value="false">Not Required</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.reimbPaid} onValueChange={v => setFilters(f => ({ ...f, reimbPaid: v }))}>
          <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="Reimb. Paid" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Paid: All</SelectItem>
            <SelectItem value="true">Paid</SelectItem>
            <SelectItem value="false">Unpaid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <th className="p-3 w-10 text-center align-bottom pb-2">
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] leading-tight">Select</span>
                <Checkbox checked={selectedIds.length === filtered.length && filtered.length > 0} onCheckedChange={v => setSelectedIds(v ? filtered.map(e => e.id) : [])} />
              </div>
            </th>
            <th className="p-3 w-14 text-center">
              <span className="text-[10px] leading-tight text-emerald-400 block mb-1">Mark Paid</span>
              <Checkbox
                className="border-emerald-500 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500 mx-auto"
                checked={checked.length === filtered.filter(e => e.reimbursement_required && !e.reimbursement_paid).length && filtered.filter(e => e.reimbursement_required && !e.reimbursement_paid).length > 0}
                onCheckedChange={v => setChecked(v ? filtered.filter(e => e.reimbursement_required && !e.reimbursement_paid).map(e => e.id) : [])}
              />
            </th>
              <th className="p-3 text-left">Date</th>
              <th className="p-3 text-left">Submitted By</th>
              <th className="p-3 text-left">Client(s)</th>
              <th className="p-3 text-left">Description</th>
              <th className="p-3 text-left">Category</th>
              <th className="p-3 text-left">Paid By</th>
              <th className="p-3 text-right">Amount</th>
              <th className="p-3 text-center">VAT</th>
              <th className="p-3 text-center">Reimb.</th>
              <th className="p-3 text-left">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((exp, idx) => (
            <motion.tr
              key={exp.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22, delay: idx * 0.03, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ backgroundColor: "var(--bg-surface-2)", x: 2 }}
              whileTap={{ scale: 0.995 }}
              className={`border-t border-border transition-colors cursor-pointer ${selectedIds.includes(exp.id) ? "bg-primary/5" : ""}`}>
              <td className="p-3 text-center">
                <Checkbox checked={selectedIds.includes(exp.id)} onCheckedChange={() => toggleSelectId(exp.id)} />
              </td>
              <td className="p-3 text-center">
                  {exp.reimbursement_required && !exp.reimbursement_paid && (
                    <Checkbox
                      className="border-emerald-500 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500 mx-auto"
                      checked={checked.includes(exp.id)}
                      onCheckedChange={() => toggleCheck(exp.id)}
                    />
                  )}
                </td>
                <td className="p-3 whitespace-nowrap cursor-pointer" onClick={() => setSelected(exp)}>{formatDateUK(exp.date)}</td>
                <td className="p-3 cursor-pointer" onClick={() => setSelected(exp)}>{exp.submitted_by_name || exp.submitted_by}</td>
                <td className="p-3 cursor-pointer" onClick={() => setSelected(exp)}>{exp.client_allocations?.map(a => a.client_code).join(", ")}</td>
                <td className="p-3 max-w-xs truncate cursor-pointer" onClick={() => setSelected(exp)}>{getDisplayDescription(exp.description)}</td>
                <td className="p-3 cursor-pointer" onClick={() => setSelected(exp)}>{exp.category && <CategoryBadge category={exp.category} showLabel={false} />}</td>
                <td className="p-3 cursor-pointer" onClick={() => setSelected(exp)}>
                  <PersonAvatar code={exp.paid_by} size="sm" showName={true} />
                </td>
                <td className="p-3 text-right font-semibold whitespace-nowrap">
                  {formatCurrency(exp.paid_amount)}
                  {exp.currency && exp.currency !== "GBP" && exp.original_amount && (
                    <div className="text-xs text-muted-foreground font-normal">{formatForeignCurrency(exp.original_amount, exp.currency)}</div>
                  )}
                </td>
                <td className="p-3 text-center">{exp.vat ? "Y" : "N"}</td>
                <td className="p-3 text-center">
                  <ReimbursementBadge required={exp.reimbursement_required} paid={exp.reimbursement_paid} />
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1.5">
                    {(() => {
                      const receiptUrl = exp.receipt_files?.[0]?.public_receipt_url || exp.primary_receipt_file_url || exp.receipt_url || exp.receipt_files?.[0]?.file_url || exp.receipt_file;
                      return receiptUrl ? (
                        <a
                          href={receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary font-mono text-xs hover:underline flex items-center gap-1"
                          onClick={(e) => {
                            e.preventDefault();
                            setReceiptMenu({ exp, x: e.clientX, y: e.clientY + 8 });
                          }}
                        >
                          {exp.receipt_code} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <button
                          className="text-xs text-muted-foreground font-mono hover:text-foreground transition-colors"
                          onClick={(e) => {
                            setReceiptMenu({ exp, x: e.clientX, y: e.clientY + 8 });
                          }}
                        >
                          {exp.receipt_code || "—"}
                        </button>
                      );
                    })()}
                    {exp.drive_sync_failed && (
                      <span title="Receipt not synced to Google Drive — please re-upload">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                      </span>
                    )}
                    <button
                      type="button"
                      title="Edit expense"
                      onClick={(e) => { e.stopPropagation(); setEditExpense(exp); }}
                      className="p-1 rounded-lg transition-colors hover:bg-[rgba(127,91,255,0.12)]"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground text-sm">No expenses found</div>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Expense Detail</DialogTitle>
          </DialogHeader>
          {selected && (
            <Button size="sm" className="mb-2" onClick={() => { setEditExpense(selected); setSelected(null); }}>
              <Pencil className="h-4 w-4 mr-1" /> Edit this expense
            </Button>
          )}
          {selected && (
          <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
           <div><span className="text-muted-foreground">Date:</span><br />{formatDateUK(selected.date)}</div>
           <div><span className="text-muted-foreground">Receipt Code:</span><br /><span className="font-mono text-primary">{selected.receipt_code}</span></div>
           <div>
             <span className="text-muted-foreground">Paid Amount:</span><br />{formatCurrency(selected.paid_amount)}
             {selected.currency && selected.currency !== "GBP" && selected.original_amount && (
               <div className="text-xs text-muted-foreground mt-0.5">
                 {formatForeignCurrency(selected.original_amount, selected.currency)}
                 {selected.exchange_rate && ` @ rate ${selected.exchange_rate.toFixed(4)}`}
               </div>
             )}
           </div>
           <div><span className="text-muted-foreground">Actual Cost:</span><br />{formatCurrency(selected.actual_cost)}</div>
           <div><span className="text-muted-foreground">Paid By:</span><br /><PersonAvatar code={selected.paid_by} size="sm" showName={true} /></div>
           <div><span className="text-muted-foreground">Submitted By:</span><br />{selected.submitted_by_name}</div>
          </div>
          <div><span className="text-muted-foreground">Description:</span><p className="mt-1">{selected.description}</p></div>
          {selected.category && <div><span className="text-muted-foreground">Category:</span><div className="mt-2"><CategoryBadge category={selected.category} showLabel={true} /></div></div>}
              <div>
                <span className="text-muted-foreground">Client(s):</span>
                <div className="mt-1 space-y-1">
                  {selected.client_allocations?.map((a, i) => (
                    <div key={i} className="flex justify-between">
                      <span>{a.client_code} — {getClientName(a.client_code)}</span>
                      <span>{a.percentage}% ({formatCurrency(a.amount)})</span>
                    </div>
                  ))}
                </div>
              </div>
              {(() => {
                const imgUrl = selected.receipt_files?.[0]?.public_receipt_url || selected.primary_receipt_file_url || selected.receipt_url || selected.receipt_files?.[0]?.file_url || selected.receipt_file;
                return imgUrl ? (
                  <div>
                    <span className="text-muted-foreground">Receipt:</span>
                    <a href={imgUrl} target="_blank" rel="noopener noreferrer" className="block mt-2">
                      <img src={imgUrl} alt="Receipt" className="rounded-lg border max-h-60 object-contain w-full" />
                    </a>
                  </div>
                ) : null;
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <EditExpenseDialog
        expense={editExpense}
        open={!!editExpense}
        onClose={() => { setEditExpense(null); setSelectedIds([]); }}
        queryKeys={[["allExpenses"]]}
      />

      <DuplicateToWD1Dialog
        expense={duplicateExpense}
        open={!!duplicateExpense}
        onClose={() => { setDuplicateExpense(null); setSelectedIds([]); }}
      />

      {/* Floating receipt context menu */}
      <AnimatePresence>
        {receiptMenu && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.92, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -4 }}
            transition={{ duration: 0.12 }}
            className="fixed z-50 rounded-[14px] shadow-xl overflow-hidden"
            style={{
              left: receiptMenu.x,
              top: receiptMenu.y,
              backgroundColor: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              minWidth: 140,
            }}
          >
            {/* Open receipt link if exists */}
            {(() => {
              const url = receiptMenu.exp.receipt_files?.[0]?.public_receipt_url || receiptMenu.exp.primary_receipt_file_url || receiptMenu.exp.receipt_url || receiptMenu.exp.receipt_files?.[0]?.file_url || receiptMenu.exp.receipt_file;
              return url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-[rgba(127,91,255,0.12)]"
                  style={{ color: "var(--text-primary)" }}
                  onClick={() => setReceiptMenu(null)}
                >
                  <ExternalLink className="h-3.5 w-3.5 text-primary" />
                  Open Receipt
                </a>
              ) : null;
            })()}
            <button
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-[rgba(127,91,255,0.12)]"
              style={{ color: "var(--text-primary)" }}
              onClick={() => { setEditExpense(receiptMenu.exp); setReceiptMenu(null); }}
            >
              <Pencil className="h-3.5 w-3.5 text-primary" />
              Edit
            </button>
            <div style={{ height: 1, backgroundColor: "var(--border-soft)" }} />
            <button
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-[rgba(255,92,122,0.1)]"
              style={{ color: "#FF5C7A" }}
              onClick={() => {
                const expToDelete = receiptMenu.exp;
                setReceiptMenu(null);
                if (confirm("Delete this expense?")) deleteExpenses.mutate([expToDelete.id]);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </AnimatedPage>
  );
}