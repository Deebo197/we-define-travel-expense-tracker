import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { formatDateUK, formatCurrency } from "@/lib/constants";

export default function DuplicateDetector({ expenses }) {
  const [expanded, setExpanded] = useState(false);

  // Find pairs with exact description + exact amount + dates within 48 hours
  const duplicatePairs = [];
  const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;

  for (let i = 0; i < expenses.length; i++) {
    for (let j = i + 1; j < expenses.length; j++) {
      const a = expenses[i];
      const b = expenses[j];
      if (
        a.description === b.description &&
        a.paid_amount === b.paid_amount &&
        Math.abs(new Date(a.date) - new Date(b.date)) <= FORTY_EIGHT_HOURS
      ) {
        duplicatePairs.push([a, b]);
      }
    }
  }

  if (duplicatePairs.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-amber-800 font-semibold text-sm hover:bg-amber-100 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
          {duplicatePairs.length} possible duplicate expense{duplicatePairs.length > 1 ? "s" : ""} detected — click to review
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="border-t border-amber-200 divide-y divide-amber-100">
          {duplicatePairs.map(([a, b], idx) => (
            <div key={idx} className="px-4 py-3">
              <p className="text-xs font-semibold text-amber-700 mb-2">⚠ Possible duplicate — please review</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[a, b].map((item, i) => (
                  <div key={i} className="bg-white rounded-lg border border-amber-200 px-3 py-2 text-xs">
                    <div className="font-medium text-gray-800">{formatDateUK(item.date)}</div>
                    <div className="text-gray-600 mt-0.5 truncate" title={item.description}>{item.description}</div>
                    <div className="text-gray-800 font-semibold mt-1">{formatCurrency(item.paid_amount)}</div>
                    {item.submitted_by_name && (
                      <div className="text-gray-400 mt-0.5">Submitted by: {item.submitted_by_name}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}