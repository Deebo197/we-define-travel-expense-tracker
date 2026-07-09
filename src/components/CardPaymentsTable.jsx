import { formatCurrency, formatDateUK } from "@/lib/constants";

export default function CardPaymentsTable({ transactions }) {
  if (!transactions.length) {
    return <div className="py-12 text-center text-muted-foreground text-sm">No card payments</div>;
  }
  const total = transactions.reduce((s, t) => s + (t.amount || 0), 0);
  return (
    <div className="bg-card rounded-xl border border-border overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <th className="px-3 py-2 text-left whitespace-nowrap">Date</th>
            <th className="px-3 py-2 text-left">Source</th>
            <th className="px-3 py-2 text-left">Description</th>
            <th className="px-3 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map(txn => (
            <tr key={txn.id} className="border-t border-border hover:bg-muted/20">
              <td className="px-3 py-2 whitespace-nowrap">{formatDateUK(txn.transaction_date)}</td>
              <td className="px-3 py-2">{txn.account_source}</td>
              <td className="px-3 py-2">{txn.description}</td>
              <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{formatCurrency(txn.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted/50 font-semibold">
            <td className="px-3 py-2" colSpan={3}>Total Payments</td>
            <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}