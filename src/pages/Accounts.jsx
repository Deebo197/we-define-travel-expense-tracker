import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, Download, FileText, AlertCircle } from "lucide-react";
import { formatCurrency, formatDateUK, CLIENT_CODES, PAID_BY_CODES, COMPANY_INFO, getClientName, formatMonth } from "@/lib/constants";
import AccountantExport from "../components/AccountantExport";

export default function Accounts() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [accountSource, setAccountSource] = useState("Barclays");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState(null);
  const [tab, setTab] = useState("pending");
  const [rowState, setRowState] = useState({});

  // Description aliases: original -> custom, persisted in localStorage
  const [descAliases, setDescAliases] = useState(() => {
    try { return JSON.parse(localStorage.getItem("wdt_desc_aliases") || "{}"); } catch { return {}; }
  });
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
  };

  const updateRowState = (id, field, value) => {
    setRowState(prev => ({ ...prev, [id]: { ...getRowState({ id }), [field]: value } }));
  };

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["bankTransactions"],
    queryFn: () => base44.entities.BankTransaction.list("-created_date", 1000),
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

    const txns = result?.transactions;

    if (!txns?.length) {
      setImportMessage({ type: "error", text: "No transactions found in the file. Please check the CSV format and column names." });
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (txns?.length) {

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
    mutationFn: async (txn) => {
      const { client_code, paid_by } = getRowState(txn);
      const clientName = getClientName(client_code);
      await base44.entities.Expense.create({
        date: txn.transaction_date,
        description: txn.description,
        paid_amount: txn.amount,
        actual_cost: txn.amount,
        vat: false,
        paid_by,
        client_allocations: [{ client_code, client_name: clientName, percentage: 100, amount: txn.amount }],
        receipt_code: `${client_code}-TXN`,
        reimbursement_required: false,
        reimbursement_paid: false,
        month: formatMonth(txn.transaction_date),
        year: new Date(txn.transaction_date).getFullYear(),
        submitted_by: "system",
        submitted_by_name: "Bank Import",
        source: "csv_import",
      });
      await base44.entities.BankTransaction.update(txn.id, { status: "expense_submitted" });
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
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="p-3 text-left">Date</th>
                  <th className="p-3 text-left">Source</th>
                  <th className="p-3 text-left">Description</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Client</th>
                  <th className="p-3 text-center">Paid By</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTxns.map(txn => (
                  <tr key={txn.id} className="border-t border-border hover:bg-muted/20">
                    <td className="p-3 whitespace-nowrap">{formatDateUK(txn.transaction_date)}</td>
                    <td className="p-3">{txn.account_source}</td>
                    <td className="p-3 max-w-xs">
                      {editingDesc[txn.id] !== undefined ? (
                        <input
                          autoFocus
                          className="w-full border border-primary rounded px-2 py-0.5 text-sm"
                          value={editingDesc[txn.id]}
                          onChange={e => setEditingDesc(prev => ({ ...prev, [txn.id]: e.target.value }))}
                          onBlur={() => saveDescAlias(txn, editingDesc[txn.id])}
                          onKeyDown={e => { if (e.key === "Enter") saveDescAlias(txn, editingDesc[txn.id]); if (e.key === "Escape") setEditingDesc(prev => { const n = { ...prev }; delete n[txn.id]; return n; }); }}
                        />
                      ) : (
                        <span
                          className="cursor-pointer hover:text-primary truncate block max-w-xs"
                          title="Click to edit description"
                          onClick={() => setEditingDesc(prev => ({ ...prev, [txn.id]: txn.description }))}
                        >{txn.description}</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-semibold">{formatCurrency(txn.amount)}</td>
                    <td className="p-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        txn.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                        txn.status === "allocated" ? "bg-blue-100 text-blue-700" :
                        txn.status === "expense_submitted" ? "bg-green-100 text-green-700" :
                        "bg-gray-100 text-gray-500"
                      }`}>
                        {txn.status}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {txn.status === "pending" && (
                        <Select value={getRowState(txn).client_code} onValueChange={v => updateRowState(txn.id, "client_code", v)}>
                          <SelectTrigger className="w-24 h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CLIENT_CODES.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {txn.status === "pending" && (
                        <Select value={getRowState(txn).paid_by} onValueChange={v => updateRowState(txn.id, "paid_by", v)}>
                          <SelectTrigger className="w-20 h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PAID_BY_CODES.map(p => <SelectItem key={p.code} value={p.code}>{p.code}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {txn.status === "pending" && (
                        <div className="flex gap-2 justify-end items-center flex-wrap">
                          <Button size="sm" className="text-xs h-7" onClick={() => submitAsExpense.mutate(txn)} disabled={submitAsExpense.isPending}>
                            Submit
                          </Button>
                          <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => updateStatus.mutate({ id: txn.id, status: "ignored" })}>
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

      {/* Accountant Export */}
      <AccountantExport />
    </div>
  );
}