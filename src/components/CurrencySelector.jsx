import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

// In-memory cache: { [currency]: { rates, timestamp } }
const rateCache = {};

// Common currencies
const CURRENCIES = [
  { code: "GBP", label: "GBP — British Pound" },
  { code: "USD", label: "USD — US Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "AED", label: "AED — UAE Dirham" },
  { code: "MVR", label: "MVR — Maldivian Rufiyaa" },
  { code: "AUD", label: "AUD — Australian Dollar" },
  { code: "CAD", label: "CAD — Canadian Dollar" },
  { code: "CHF", label: "CHF — Swiss Franc" },
  { code: "JPY", label: "JPY — Japanese Yen" },
  { code: "SGD", label: "SGD — Singapore Dollar" },
  { code: "THB", label: "THB — Thai Baht" },
  { code: "INR", label: "INR — Indian Rupee" },
  { code: "ZAR", label: "ZAR — South African Rand" },
];

export default function CurrencySelector({ currency, originalAmount, exchangeRate, onCurrencyChange, onOriginalAmountChange, onExchangeRateChange, onGbpAmountChange }) {
  const [fetching, setFetching] = useState(false);
  const [rateError, setRateError] = useState("");

  const isForeign = currency && currency !== "GBP";

  const fetchExchangeRate = async (curr) => {
    if (!curr || curr === "GBP") return;
    setFetching(true);
    setRateError("");
    try {
      // Use cache if less than 1 hour old
      const cached = rateCache[curr];
      let rates;
      if (cached && Date.now() - cached.timestamp < 60 * 60 * 1000) {
        rates = cached.rates;
      } else {
        const res = await fetch(`https://open.er-api.com/v6/latest/GBP`);
        if (!res.ok) throw new Error(`Rate fetch failed (${res.status})`);
        const data = await res.json();
        rates = data.rates;
        rateCache[curr] = { rates, timestamp: Date.now() };
      }
      if (rates?.[curr]) {
        const rate = rates[curr];
        const rateToGBP = 1 / rate;
        onExchangeRateChange(parseFloat(rateToGBP.toFixed(6)));
        if (originalAmount) {
          const gbp = parseFloat((parseFloat(originalAmount) * rateToGBP).toFixed(2));
          onGbpAmountChange(gbp);
        }
      } else {
        setRateError("Could not fetch rate. Please enter manually.");
      }
    } catch (err) {
      setRateError("Could not fetch rate. Please enter manually.");
      toast.error(err.message || "Failed to fetch exchange rate");
    } finally {
      setFetching(false);
    }
  };

  const handleCurrencyChange = (curr) => {
    onCurrencyChange(curr);
    if (curr !== "GBP") {
      fetchExchangeRate(curr);
    } else {
      onExchangeRateChange(null);
      onOriginalAmountChange("");
    }
  };

  const handleOriginalAmountChange = (val) => {
    onOriginalAmountChange(val);
    if (exchangeRate && val) {
      const gbp = parseFloat((parseFloat(val) * exchangeRate).toFixed(2));
      onGbpAmountChange(gbp);
    }
  };

  const handleExchangeRateChange = (val) => {
    onExchangeRateChange(parseFloat(val) || null);
    if (val && originalAmount) {
      const gbp = parseFloat((parseFloat(originalAmount) * parseFloat(val)).toFixed(2));
      onGbpAmountChange(gbp);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm font-medium">Currency</Label>
        <Select value={currency || "GBP"} onValueChange={handleCurrencyChange}>
          <SelectTrigger className="mt-1.5">
            <SelectValue placeholder="Select currency" />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map(c => (
              <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isForeign && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <p className="text-xs text-blue-700 font-medium">Foreign currency — enter original amount and exchange rate to GBP</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium">Amount in {currency} *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={originalAmount || ""}
                onChange={(e) => handleOriginalAmountChange(e.target.value)}
                className="mt-1.5"
                placeholder="0.00"
              />
            </div>
            <div>
              <Label className="text-sm font-medium flex items-center gap-1.5">
                Rate to GBP
                <button
                  type="button"
                  onClick={() => fetchExchangeRate(currency)}
                  className="text-blue-600 hover:text-blue-800"
                  title="Refresh rate from web"
                >
                  {fetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                </button>
              </Label>
              <Input
                type="number"
                step="0.000001"
                min="0"
                value={exchangeRate || ""}
                onChange={(e) => handleExchangeRateChange(e.target.value)}
                className="mt-1.5"
                placeholder="e.g. 0.236"
              />
            </div>
          </div>

          {rateError && <p className="text-xs text-red-600">{rateError}</p>}
          {!rateError && exchangeRate && (
            <p className="text-xs text-blue-600">1 {currency} = £{exchangeRate.toFixed(4)} GBP (editable)</p>
          )}
        </div>
      )}
    </div>
  );
}