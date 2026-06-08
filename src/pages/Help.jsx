import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Send, Bot, ChevronDown, ChevronUp, BookOpen, FileText, MapPin, Inbox, CreditCard, BarChart2, Building2, LayoutDashboard } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

const SECTIONS = [
  {
    icon: FileText,
    title: "Submit Expense",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    content: "Record any business expense by going to Submit Expense. Fill in the date paid, description, amount (GBP), and select who paid. If paid on a personal card (CB, ST, DJ), a reimbursement will be flagged automatically. You can split the cost across multiple clients using the Client Allocation section. Attach a receipt image or PDF — OCR will auto-fill details where possible. If the expense belongs to a different invoice period than when it was paid, set an optional Invoice Date."
  },
  {
    icon: Inbox,
    title: "Receipt Inbox",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    content: "Upload receipts in bulk or individually via the Receipt Inbox. The system uses AI to extract the date, supplier, amount, and VAT status. Review the extracted data, make any corrections, then confirm to create the expense record. You can merge multiple receipt files into a single expense."
  },
  {
    icon: MapPin,
    title: "Mileage Log",
    color: "text-green-400",
    bg: "bg-green-500/10",
    content: "Log work journeys by entering your start and end postcodes (plus any stops). The app calculates the distance using live routing and applies the HMRC mileage rate automatically: Cars 45p/mile (55p/mile from June 2026), Motorcycles 24p/mile, Bicycles 20p/mile. Select the client the journey relates to and tick Return Journey if applicable."
  },
  {
    icon: BookOpen,
    title: "My Expenses",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    content: "View all expenses you have submitted. You can filter by month, status, and client. Click the edit icon on any expense to amend details. Expenses with a reimbursement pending are highlighted — once paid by the company, an admin will mark them as reimbursed."
  },
  {
    icon: CreditCard,
    title: "Reimbursements (Admin)",
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    content: "Admins can view all expenses that require reimbursement to staff. Filter by person and mark individual expenses as paid once the bank transfer has been made. The total outstanding per person is shown at the top."
  },
  {
    icon: BarChart2,
    title: "Client Report (Admin)",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    content: "Generate a detailed expense and mileage report for a specific client within a date range. The report groups costs by month with subtotals and can be exported as a PDF or Excel file for invoicing purposes. Use the Invoice Date feature to ensure expenses appear in the correct billing period."
  },
  {
    icon: Building2,
    title: "Accounts (Admin)",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    content: "Import bank transaction CSV files from Barclays or Amex. The AI parses each row and creates transaction records. You can then review each transaction, assign a client, category, and paid-by code, then submit it as an expense in one click. WDT/WeDefine transactions are auto-allocated. You can also rename descriptions — the alias will be remembered for future imports."
  },
  {
    icon: LayoutDashboard,
    title: "Dashboard (Admin)",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    content: "The dashboard gives admins a real-time overview of total spend, pending reimbursements by person, monthly trends, and receipts awaiting review in the inbox. Use it as your starting point each day to see what needs attention."
  },
];

function GuideSections() {
  const [openIdx, setOpenIdx] = useState(null);
  return (
    <div className="space-y-2">
      {SECTIONS.map((s, i) => {
        const Icon = s.icon;
        const isOpen = openIdx === i;
        return (
          <div key={i} className="rounded-xl border border-border overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
              onClick={() => setOpenIdx(isOpen ? null : i)}
            >
              <span className={cn("p-1.5 rounded-lg", s.bg)}>
                <Icon className={cn("h-4 w-4", s.color)} />
              </span>
              <span className="font-medium text-sm flex-1">{s.title}</span>
              {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pt-1 text-sm text-muted-foreground leading-relaxed border-t border-border bg-muted/10">
                {s.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChatMessage({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="h-7 w-7 rounded-lg bg-violet-500/20 flex items-center justify-center mt-0.5 flex-shrink-0">
          <Bot className="h-4 w-4 text-violet-400" />
        </div>
      )}
      <div className={cn(
        "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
        isUser
          ? "bg-primary text-primary-foreground"
          : "bg-card border border-border text-foreground"
      )}>
        {isUser ? (
          <p className="leading-relaxed">{message.content}</p>
        ) : (
          <ReactMarkdown
            className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
            components={{
              p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
              ul: ({ children }) => <ul className="my-1 ml-4 list-disc">{children}</ul>,
              ol: ({ children }) => <ol className="my-1 ml-4 list-decimal">{children}</ol>,
              li: ({ children }) => <li className="my-0.5">{children}</li>,
              strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
            }}
          >
            {message.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}

export default function Help() {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      const conv = await base44.agents.createConversation({
        agent_name: "expense_assistant",
        metadata: { name: "Help Chat" },
      });
      setConversation(conv);
      setMessages(conv.messages || []);
    };
    init();
  }, []);

  useEffect(() => {
    base44.agents.subscribeToConversation(conversation?.id, (data) => {
      setMessages(data.messages || []);
    });
  }, [conversation?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !conversation || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    await base44.agents.addMessage(conversation, { role: "user", content: text });
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const visibleMessages = messages.filter(m => m.role === "user" || m.role === "assistant");

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold">Help & Guide</h1>
        <p className="text-muted-foreground text-sm mt-1">Learn how to use the app, or ask the AI assistant any question.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left — Guide */}
        <div>
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-violet-400" /> App Guide
          </h2>
          <GuideSections />
        </div>

        {/* Right — Chat */}
        <div className="bg-card border border-border rounded-2xl flex flex-col overflow-hidden" style={{ height: "600px" }}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0">
            <div className="h-7 w-7 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <Bot className="h-4 w-4 text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">Expense Assistant</p>
              <p className="text-xs text-muted-foreground">Ask me anything about the app or your expenses</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {visibleMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-violet-500/10 flex items-center justify-center">
                  <Bot className="h-6 w-6 text-violet-400" />
                </div>
                <div>
                  <p className="font-medium text-sm">Hi! I'm your Expense Assistant.</p>
                  <p className="text-xs text-muted-foreground mt-1">Ask me how to submit an expense, about your reimbursements, mileage rates, or anything else about the app.</p>
                </div>
                <div className="flex flex-col gap-1.5 w-full max-w-xs mt-2">
                  {["How do I submit an expense?", "What are the mileage rates?", "Show me my recent expenses"].map(q => (
                    <button
                      key={q}
                      onClick={() => setInput(q)}
                      className="text-xs px-3 py-2 rounded-xl border border-border hover:bg-muted/40 transition-colors text-left text-muted-foreground"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {visibleMessages.map((m, i) => (
              <ChatMessage key={i} message={m} />
            ))}
            {sending && (
              <div className="flex gap-3 justify-start">
                <div className="h-7 w-7 rounded-lg bg-violet-500/20 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <Bot className="h-4 w-4 text-violet-400" />
                </div>
                <div className="bg-card border border-border rounded-2xl px-4 py-2.5">
                  <div className="flex gap-1 items-center h-4">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-border flex-shrink-0">
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-xl border border-border bg-[var(--bg-surface-2)] text-[var(--text-primary)] px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                placeholder="Ask a question..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!conversation || sending}
              />
              <Button
                size="icon"
                onClick={sendMessage}
                disabled={!input.trim() || !conversation || sending}
                className="h-9 w-9 rounded-xl flex-shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}