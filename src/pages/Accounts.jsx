import { useState, useMemo, useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Paperclip, SplitSquareHorizontal } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ClientSplitInput from "../components/ClientSplitInput";
import CategorySelectItem from "../components/CategorySelectItem";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, Download, FileText, AlertCircle } from "lucide-react";
import { formatCurrency, formatDateUK, CLIENT_CODES, PAID_BY_CODES, COMPANY_INFO, getClientName, formatMonth, getCategoriesForClient, ALL_CATEGORIES, CLIENT_CATEGORIES } from "@/lib/constants";
import { toast } from "sonner";
import AccountantExport from "../components/AccountantExport";
import DuplicateDetector from "../components/DuplicateDetector";
import PersonAvatar from '../components/PersonAvatar';

export default function Accounts() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [accountSource, setAccountSource] = useState("Barclays");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState(null);
  const [tab, setTab] = useState("pending");
  const [rowState, setRowState] = useState({});
  const [rowReceipts, setRowReceipts] = useState({}); // { [txnId]: { url, name } }
  const [rowAllocations, setRowAllocations] = useState({}); // { [txnId]: [...allocations] }
  const [splitDialogTxn, setSplitDialogTxn] = useState(null);
  const receiptInputRefs = useRef({});

  // Description aliases: original -> custom, persisted in localStorage
  const [descAliases, setDescAliases] = useState(() => {
    try { return JSON.parse(localStorage.getItem("wdt_desc_aliases") || "{}"); } catch { return {}; }
  });
  // Category aliases: description -> category, persisted in localStorage
  const [catAliases, setCatAliases] = useState(() => {
    try { return JSON.parse(localStorage.getItem("wdt_cat_aliases") || "{}"); } catch { return {}; }
  });
  // VAT aliases: description -> boolean, persisted in localStorage
  const [vatAliases, setVatAliases] = useState(() => {
    try { return JSON.parse(localStorage.getItem("wdt_vat_aliases") || "{}"); } catch { return {}; }
  });
  // Reverse map: newDesc -> originalDesc
  const reverseAliases = useMemo(() => {
    const r = {};
    Object.entries(descAliases).forEach(([orig, alias]) => { r[alias] = orig; });
    return r;
  }, [descAliases]);
  const [editingDesc, setEditingDesc] = useState({}); // { [txnId]: currentEditValue }

  const saveDescAlias = async (txn, newDesc) => {
    const updated = { ...descAliases, [txn.description]: newDesc };
    setDescAliases(updated);
    localStorage.setItem("wdt_desc_aliases", JSON.stringify(updated));
    await base44.entities.BankTransaction.update(txn.id, { description: newDesc });
    queryClient.invalidateQueries({ queryKey: ["bankTransactions"] });
    setEditingDesc(prev => { const n = { ...prev }; delete n[txn.id]; return n; });
  };

  const getRowState = (txn) => rowState[txn.id] || {
    client_code: "WD",
    paid_by: "WD",
    category: catAliases[txn.description] || "",
    vat: vatAliases[txn.description] || false,
  };

  const getRowAllocations = (txn) => {
    if (rowAllocations[txn.id]) return rowAllocations[txn.id];
    const code = getRowState(txn).client_code;
    return [{ client_code: code, client_name: getClientName(code), percentage: 100, amount: txn.amount }];
  };

  const updateRowState = (id, field, value) => {
    setRowState(prev => ({ ...prev, [id]: { ...getRowState({ id }), [field]: value } }));
  };

  const handleReceiptUpload = async (txnId, file) => {
    if (!file) return;
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setRowReceipts(prev => ({ ...prev, [txnId]: { url: file_url, name: file.name } }));
  };

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["bankTransactions"],
    queryFn: () => base44.entities.BankTransaction.list("-created_date", 1000),
  });

  const { data: allExpensesForDupes = [] } = useQuery({
    queryKey: ["allExpensesForDupes"],
    queryFn: () => base44.entities.Expense.list("-date", 2000),
  });

  const handleCSVImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMessage(null);

    // Read CSV as text and pass directly in the prompt
    const csvText = await file.text();

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Parse this bank transaction CSV and extract all transactions. Columns may include: Number, Date, Account, Amount, Subcategory, Memo (or similar). Map as follows:
- date: from Date column, convert to YYYY-MM-DD (input is DD/MM/YYYY)
- description: from Memo or Description column, trim all whitespace and tab characters
- amount: from Amount column as a number, use the absolute value (ignore negative sign)
Return ALL rows. Do not skip any.

CSV content:
${csvText}`,
      response_json_schema: {
        type: "object",
        properties: {
          transactions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string" },
                description: { type: "string" },
                amount: { type: "number" },
              },
            },
          },
        },
      },
    });

    let txns = result?.transactions;

    if (!txns?.length) {
      setImportMessage({ type: "error", text: "No transactions found in the file. Please check the CSV format and column names." });
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (txns?.length) {
      // Validate LLM output — filter out bad rows
      const validTxns = txns.filter(t =>
        typeof t.amount === "number" && !isNaN(t.amount) &&
        t.description && t.description.trim() !== "" &&
        !isNaN(Date.parse(t.date))
      );
      const skipped = txns.length - validTxns.length;
      if (skipped > 0) {
        toast.warning(`${skipped} row(s) were skipped due to missing or invalid data (amount, date, or description).`);
      }
      txns = validTxns;

      for (const txn of txns) {
        // Apply saved alias if exists
        if (descAliases[txn.description]) txn.description = descAliases[txn.description];
        const isWD = /we define|wedefine|wdt/i.test(txn.description);
        const isWD1 = /margin|wd1/i.test(txn.description);
        const autoProcessed = isWD || isWD1;

        const record = {
          account_source: accountSource,
          transaction_date: txn.date,
          description: txn.description,
          amount: Math.abs(txn.amount),
          status: autoProcessed ? "allocated" : "pending",
          auto_processed: autoProcessed,
        };

        const created = await base44.entities.BankTransaction.create(record);

        if (autoProcessed) {
          const clientCode = isWD1 ? "WD1" : "WD";
          await base44.entities.Expense.create({
            date: txn.date,
            description: txn.description,
            paid_amount: Math.abs(txn.amount),
            actual_cost: Math.abs(txn.amount),
            vat: false,
            paid_by: "WD",
            client_allocations: [{ client_code: clientCode, client_name: getClientName(clientCode), percentage: 100, amount: Math.abs(txn.amount) }],
            receipt_code: `${clientCode}-AUTO`,
            reimbursement_required: false,
            reimbursement_paid: false,
            month: formatMonth(txn.date),
            year: new Date(txn.date).getFullYear(),
            submitted_by: "system",
            submitted_by_name: "Auto Import",
            source: "csv_import",
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ["bankTransactions"] });
      queryClient.invalidateQueries({ queryKey: ["allExpenses"] });
      setImportMessage({ type: "success", text: `Successfully imported ${txns.length} transaction(s).` });
    }

    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submitAsExpense = useMutation({
    onError: (err) => toast.error(err.message || "Failed to submit expense"),
    mutationFn: async (txn) => {
      const { paid_by, category } = getRowState(txn);
      const allocations = getRowAllocations(txn);
      const receipt = rowReceipts[txn.id];
      await base44.entities.Expense.create({
        date: txn.transaction_date,
        description: txn.description,
        paid_amount: txn.amount,
        actual_cost: txn.amount,
        vat: getRowState(txn).vat || false,
        receipt_file: receipt?.url || "",
        receipt_url: receipt?.url || "",
        paid_by,
        category: category || "",
        client_allocations: allocations,
        receipt_code: `${allocations[0]?.client_code || "WD"}-TXN`,
        reimbursement_required: false,
        reimbursement_paid: false,
        month: formatMonth(txn.transaction_date),
        year: new Date(txn.transaction_date).getFullYear(),
        submitted_by: "system",
        submitted_by_name: "Bank Import",
        source: "csv_import",
      });
      await base44.entities.BankTransaction.update(txn.id, { status: "expense_submitted" });
      // Remember category for this description
      if (category) {
        const updatedCats = { ...catAliases, [txn.description]: category };
        setCatAliases(updatedCats);
        localStorage.setItem("wdt_cat_aliases", JSON.stringify(updatedCats));
      }
      // Remember VAT for this description
      const vat = getRowState(txn).vat || false;
      const updatedVats = { ...vatAliases, [txn.description]: vat };
      setVatAliases(updatedVats);
      localStorage.setItem("wdt_vat_aliases", JSON.stringify(updatedVats));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bankTransactions"] });
      queryClient.invalidateQueries({ queryKey: ["allExpenses"] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }) => {
      await base44.entities.BankTransaction.update(id, { status });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bankTransactions"] }),
    onError: (err) => toast.error(err.message || "Failed to update status"),
  });

  const counts = useMemo(() => ({
    pending: transactions.filter(t => t.status === "pending").length,
    allocated: transactions.filter(t => t.status === "allocated").length,
    expense_submitted: transactions.filter(t => t.status === "expense_submitted").length,
    ignored: transactions.filter(t => t.status === "ignored").length,
  }), [transactions]);

  const pendingAmount = transactions.filter(t => t.status === "pending").reduce((s, t) => s + (t.amount || 0), 0);

  const filteredTxns = tab === "all" ? transactions : transactions.filter(t => t.status === tab);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Accounts</h1>
      <DuplicateDetector expenses={allExpensesForDupes} />

      {/* CSV Import */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="font-semibold mb-3">Import Bank Transactions</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-sm">Account</Label>
            <Select value={accountSource} onValueChange={setAccountSource}>
              <SelectTrigger className="w-36 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Barclays">Barclays</SelectItem>
                <SelectItem value="Amex">Amex</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Button onClick={() => fileInputRef.current?.click()} disabled={importing} variant="outline" className="gap-1.5">
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importing ? "Processing..." : "Import CSV"}
            </Button>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleCSVImport} />
          </div>
        </div>
        {importMessage && (
          <div className={`mt-3 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 ${
            importMessage.type === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"
          }`}>
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {importMessage.text}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Pending</p>
          <p className="text-2xl font-bold">{counts.pending}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Pending Amount</p>
          <p className="text-2xl font-bold">{formatCurrency(pendingAmount)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Total Imported</p>
          <p className="text-2xl font-bold">{transactions.length}</p>
        </div>
      </div>

      {/* Transactions */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
          <TabsTrigger value="allocated">Allocated ({counts.allocated})</TabsTrigger>
          <TabsTrigger value="expense_submitted">Submitted ({counts.expense_submitted})</TabsTrigger>
          <TabsTrigger value="ignored">Ignored ({counts.ignored})</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <div className="bg-card rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                   <th className="px-2 py-2 text-left whitespace-nowrap">Date</th>
                   <th className="px-2 py-2 text-left">Src</th>
                   <th className="px-2 py-2 text-left">Description</th>
                   <th className="px-2 py-2 text-right">Amount</th>
                   <th className="px-2 py-2 text-center">Status</th>
                   <th className="px-2 py-2 text-center">Client</th>
                   <th className="px-2 py-2 text-center">Paid By</th>
                   <th className="px-2 py-2 text-center">Category</th>
                   <th className="px-2 py-2 text-center">VAT</th>
                   <th className="px-2 py-2 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTxns.map(txn => (
                  <tr key={txn.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-2 py-1.5 whitespace-nowrap">{formatDateUK(txn.transaction_date)}</td>
                    <td className="px-2 py-1.5">{txn.account_source}</td>
                    <td className="px-2 py-1.5 max-w-[160px]">
                      {editingDesc[txn.id] !== undefined ? (
                        <input
                          autoFocus
                          className="w-full border border-primary rounded px-2 py-0.5 text-sm bg-[var(--bg-surface-2)] text-[var(--text-primary)]"
                          value={editingDesc[txn.id]}
                          onChange={e => setEditingDesc(prev => ({ ...prev, [txn.id]: e.target.value }))}
                          onBlur={() => saveDescAlias(txn, editingDesc[txn.id])}
                          onKeyDown={e => { if (e.key === "Enter") saveDescAlias(txn, editingDesc[txn.id]); if (e.key === "Escape") setEditingDesc(prev => { const n = { ...prev }; delete n[txn.id]; return n; }); }}
                        />
                      ) : (
                        <>
                          <span
                            className="cursor-pointer hover:text-primary truncate block max-w-xs"
                            title="Click to edit description"
                            onClick={() => setEditingDesc(prev => ({ ...prev, [txn.id]: txn.description }))}
                          >{txn.description}</span>
                          {reverseAliases[txn.description] && (
                            <span className="text-xs text-muted-foreground truncate block max-w-xs" title={reverseAliases[txn.description]}>
                              was: {reverseAliases[txn.description]}
                            </span>
                          )}
                        </>
                        )}
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">{formatCurrency(txn.amount)}</td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        txn.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                        txn.status === "allocated" ? "bg-blue-100 text-blue-700" :
                        txn.status === "expense_submitted" ? "bg-green-100 text-green-700" :
                        "bg-gray-100 text-gray-500"
                      }`}>
                        {txn.status}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {txn.status === "pending" && (
                        <div className="flex items-center gap-1">
                          {rowAllocations[txn.id]?.length > 1 ? (
                            <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                              {rowAllocations[txn.id].map(a => a.client_code).join("+")}
                            </span>
                          ) : (
                            <Select value={getRowState(txn).client_code} onValueChange={v => {
                              updateRowState(txn.id, "client_code", v);
                              setRowAllocations(prev => { const n = {...prev}; delete n[txn.id]; return n; });
                            }}>
                              <SelectTrigger className="w-20 h-6 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {CLIENT_CODES.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className={`h-6 w-6 p-0 ${rowAllocations[txn.id] ? "text-primary" : "text-muted-foreground"}`}
                            title="Split by client"
                            onClick={() => setSplitDialogTxn(txn)}
                          >
                            <SplitSquareHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                      {txn.status !== "pending" && txn.client_allocations?.map(a => a.client_code).join(", ")}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {txn.status === "pending" && (
                        <Select value={getRowState(txn).paid_by} onValueChange={v => updateRowState(txn.id, "paid_by", v)}>
                          <SelectTrigger className="w-24 h-6 text-xs">
                            {getRowState(txn).paid_by ? (
                              <div className="flex items-center gap-1">
                                <PersonAvatar code={getRowState(txn).paid_by} size="xs" />
                                <span>{getRowState(txn).paid_by}</span>
                              </div>
                            ) : <SelectValue />}
                          </SelectTrigger>
                          <SelectContent>
                            {PAID_BY_CODES.map(p => (
                              <SelectItem key={p.code} value={p.code}>
                                <div className="flex items-center gap-2">
                                  <PersonAvatar code={p.code} size="xs" />
                                  <span>{p.code} — {p.label}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {txn.status === "pending" && (() => {
                        const allocations = getRowAllocations(txn);
                        const hasNonWDClient = allocations.some(a => a.client_code !== "WD" && a.client_code !== "WD1");
                        const cats = hasNonWDClient ? CLIENT_CATEGORIES : getCategoriesForClient(getRowState(txn).client_code);
                        return (
                          <Select value={getRowState(txn).category} onValueChange={v => updateRowState(txn.id, "category", v)}>
                            <SelectTrigger className="w-28 h-6 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                            <SelectContent>
                              {cats.map(c => <CategorySelectItem key={c} category={c} />)}
                            </SelectContent>
                          </Select>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                       {txn.status === "pending" && (
                         <Checkbox
                           checked={getRowState(txn).vat || false}
                           onCheckedChange={v => updateRowState(txn.id, "vat", !!v)}
                         />
                       )}
                     </td>
                    <td className="px-2 py-1.5 text-right">
                       {txn.status === "pending" && (
                         <div className="flex gap-1 justify-end items-center">
                           <div className="flex items-center gap-1">
                             <input
                               type="file"
                               accept="image/*,.pdf"
                               className="hidden"
                               ref={el => receiptInputRefs.current[txn.id] = el}
                               onChange={e => handleReceiptUpload(txn.id, e.target.files?.[0])}
                             />
                             <Button
                               size="sm"
                               variant="outline"
                               className={`text-xs h-6 px-1.5 gap-0.5 ${rowReceipts[txn.id] ? "text-green-600 border-green-400" : ""}`}
                               onClick={() => receiptInputRefs.current[txn.id]?.click()}
                               title={rowReceipts[txn.id]?.name || "Attach receipt"}
                             >
                               <Paperclip className="h-3 w-3" />
                               {rowReceipts[txn.id] ? "✓" : ""}
                             </Button>
                           </div>
                           <Button size="sm" className="text-xs h-6 px-2" onClick={() => submitAsExpense.mutate(txn)} disabled={submitAsExpense.isPending}>
                             Submit
                           </Button>
                           <Button size="sm" variant="ghost" className="text-xs h-6 px-2" onClick={() => updateStatus.mutate({ id: txn.id, status: "ignored" })}>
                             Ignore
                           </Button>
                         </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredTxns.length === 0 && (
              <div className="py-12 text-center text-muted-foreground text-sm">No transactions</div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Client split dialog */}
      {splitDialogTxn && (
        <Dialog open={!!splitDialogTxn} onOpenChange={() => setSplitDialogTxn(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Split Client Allocation</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mb-2">{splitDialogTxn.description} — <strong>{formatCurrency(splitDialogTxn.amount)}</strong></p>
            <ClientSplitInput
              allocations={getRowAllocations(splitDialogTxn)}
              onChange={allocs => setRowAllocations(prev => ({ ...prev, [splitDialogTxn.id]: allocs }))}
              paidAmount={splitDialogTxn.amount}
            />
            <div className="mt-4 border-t border-border pt-4">
              <Label className="text-sm font-medium mb-1.5 block">Category</Label>
              <Select
                value={getRowState(splitDialogTxn).category}
                onValueChange={v => updateRowState(splitDialogTxn.id, "category", v)}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__wdt_header" disabled className="text-xs font-semibold text-muted-foreground">— WDT Categories —</SelectItem>
                  {ALL_CATEGORIES.filter(c => c.startsWith("WDT")).map(c => <CategorySelectItem key={c} category={c} />)}
                  <SelectItem value="__client_header" disabled className="text-xs font-semibold text-muted-foreground">— Client Categories —</SelectItem>
                  {ALL_CATEGORIES.filter(c => !c.startsWith("WDT")).map(c => <CategorySelectItem key={c} category={c} />)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={() => setSplitDialogTxn(null)}>Done</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Accountant Export */}
      <AccountantExport />
    </div>
  );
}