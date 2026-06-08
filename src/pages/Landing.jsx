import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Receipt, Car, Inbox, BarChart3, FileText, Upload, Mail,
  CheckCircle, ArrowRight, Shield, Zap, Globe, Users
} from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Receipt,
    title: "Smart Expense Submission",
    description: "Submit expenses in seconds with OCR receipt scanning. The app reads your receipts and pre-fills all the details automatically.",
    color: "#7F5BFF",
  },
  {
    icon: Inbox,
    title: "Receipt Inbox",
    description: "Forward receipts by email or bulk upload photos. Every receipt lands in a structured inbox, ready to review and confirm.",
    color: "#3DDC97",
  },
  {
    icon: Car,
    title: "Mileage Tracking",
    description: "Log business journeys with multi-stop route planning. Automatic HMRC rate calculations with map route images generated for every trip.",
    color: "#FFB547",
  },
  {
    icon: BarChart3,
    title: "Client Reporting",
    description: "Allocate costs across multiple clients with percentage splits. Generate detailed PDF reports per client with full receipt links.",
    color: "#FF5C7A",
  },
  {
    icon: FileText,
    title: "Bank Reconciliation",
    description: "Import Barclays and Amex statements. AI-powered matching links transactions to submitted expenses automatically.",
    color: "#38BDF8",
  },
  {
    icon: Globe,
    title: "Google Drive Sync",
    description: "Every receipt is automatically filed in a structured Google Drive folder — organised by year, month, and payment group.",
    color: "#A78BFA",
  },
];

const stats = [
  { value: "100%", label: "Paperless" },
  { value: "HMRC", label: "Compliant" },
  { value: "Multi", label: "Currency" },
  { value: "Real-time", label: "Reporting" },
];

const howItWorks = [
  {
    step: "01",
    title: "Submit or Forward a Receipt",
    description: "Upload a photo, forward an email, or log a mileage journey directly in the app.",
  },
  {
    step: "02",
    title: "AI Extracts the Details",
    description: "OCR automatically reads the date, supplier, amount and currency — no manual typing required.",
  },
  {
    step: "03",
    title: "Allocate to Clients",
    description: "Split costs across one or multiple clients by percentage, with automatic amount calculations.",
  },
  {
    step: "04",
    title: "Sync & Report",
    description: "Receipts are filed to Google Drive and full client reports are available to export as PDF or Excel.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] font-inter overflow-x-hidden">

      {/* ── Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-[var(--border-soft)] backdrop-blur-md bg-[rgba(11,11,15,0.8)]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 brand-gradient rounded-xl flex items-center justify-center">
            <Receipt className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-white">WDT Expenses</span>
        </div>
        <Link to="/home">
          <Button size="sm" className="h-9 px-5 text-sm">
            Sign In <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-24 px-6 hero-glow">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 bg-[rgba(127,91,255,0.12)] border border-[rgba(127,91,255,0.3)] rounded-full px-4 py-1.5 text-sm text-[#A78BFA] mb-6">
              <Zap className="w-3.5 h-3.5" />
              AI-Powered Expense Management
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-tight mb-6">
              Expense management{" "}
              <span className="brand-gradient-text">that works for you</span>
            </h1>
            <p className="text-xl text-[var(--text-secondary)] max-w-2xl mx-auto leading-relaxed mb-10">
              WDT Expenses handles receipt capture, mileage logging, multi-client allocation,
              and bank reconciliation — all in one place, with automatic Google Drive sync.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/home">
                <Button size="lg" className="w-full sm:w-auto">
                  Get Started <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <a href="#features">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  See Features
                </Button>
              </a>
            </div>
          </motion.div>
        </div>

        {/* Hero visual */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mt-20 max-w-5xl mx-auto"
        >
          <div className="relative rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] overflow-hidden card-elevation">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--border-soft)] bg-[var(--bg-surface-2)]">
              <div className="w-3 h-3 rounded-full bg-[#FF5C7A]" />
              <div className="w-3 h-3 rounded-full bg-[#FFB547]" />
              <div className="w-3 h-3 rounded-full bg-[#3DDC97]" />
              <span className="ml-3 text-xs text-[var(--text-tertiary)] font-mono">WDT Expenses — Dashboard</span>
            </div>
            <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Spend (May)", value: "£8,420", color: "#7F5BFF" },
                { label: "Pending Review", value: "3 receipts", color: "#FFB547" },
                { label: "Reimbursements Due", value: "£1,240", color: "#FF5C7A" },
                { label: "Drive Synced", value: "100%", color: "#3DDC97" },
              ].map((card) => (
                <div key={card.label} className="rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-soft)] p-4">
                  <div className="text-xs text-[var(--text-tertiary)] mb-2">{card.label}</div>
                  <div className="text-xl font-bold" style={{ color: card.color }}>{card.value}</div>
                </div>
              ))}
            </div>
            <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { desc: "Train Peterborough → London", code: "R-250523-001", amount: "£52.00", badge: "WCA-CB" },
                { desc: "Coffee for the office", code: "R-250523-002", amount: "£24.50", badge: "WD-WD1" },
                { desc: "Taxi to train station", code: "R-250601-001", amount: "£18.00", badge: "WSA-ST" },
              ].map((row) => (
                <div key={row.code} className="flex items-center justify-between rounded-xl bg-[var(--bg-elevated)] px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-white truncate max-w-[160px]">{row.desc}</div>
                    <div className="text-xs text-[var(--text-tertiary)]">{row.code}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-white">{row.amount}</div>
                    <div className="text-xs bg-[rgba(127,91,255,0.15)] text-[#A78BFA] rounded-full px-2 py-0.5">{row.badge}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── Stats ── */}
      <section className="py-16 px-6 border-y border-[var(--border-soft)]">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="text-3xl font-bold brand-gradient-text mb-1">{s.value}</div>
              <div className="text-sm text-[var(--text-tertiary)]">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Everything you need to manage expenses</h2>
            <p className="text-[var(--text-secondary)] text-lg max-w-2xl mx-auto">
              From receipt capture to client reporting — every step of the expense workflow, automated.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] p-6 hover:border-[var(--border-strong)] transition-colors card-elevation"
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${f.color}20` }}
                >
                  <f.icon className="w-5 h-5" style={{ color: f.color }} />
                </div>
                <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-[var(--text-secondary)] text-sm leading-relaxed">{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-24 px-6 bg-[var(--bg-surface)]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">How it works</h2>
            <p className="text-[var(--text-secondary)] text-lg">From receipt to report in four simple steps.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {howItWorks.map((step, i) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, x: i % 2 === 0 ? -24 : 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex gap-5"
              >
                <div className="flex-shrink-0 w-12 h-12 rounded-2xl brand-gradient flex items-center justify-center text-white font-bold text-sm">
                  {step.step}
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-1">{step.title}</h3>
                  <p className="text-[var(--text-secondary)] text-sm leading-relaxed">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Integrations ── */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-4">Built-in integrations</h2>
          <p className="text-[var(--text-secondary)] text-lg mb-12">
            Connects with the tools your business already uses.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: "Google Drive", icon: "📁", desc: "Auto-file receipts" },
              { name: "Outlook Email", icon: "📧", desc: "Forward receipts in" },
              { name: "Barclays / Amex", icon: "🏦", desc: "Bank reconciliation" },
              { name: "HMRC Rates", icon: "🚗", desc: "Mileage compliance" },
            ].map((item) => (
              <div
                key={item.name}
                className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] p-5 text-center hover:border-[rgba(127,91,255,0.4)] transition-colors"
              >
                <div className="text-3xl mb-3">{item.icon}</div>
                <div className="font-semibold text-sm mb-1">{item.name}</div>
                <div className="text-xs text-[var(--text-tertiary)]">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-3xl brand-gradient p-px">
            <div className="rounded-3xl bg-[var(--bg-base)] p-12 text-center">
              <Shield className="w-12 h-12 text-[#7F5BFF] mx-auto mb-6" />
              <h2 className="text-4xl font-bold mb-4">Ready to get started?</h2>
              <p className="text-[var(--text-secondary)] text-lg mb-8">
                Sign in to access your expense dashboard, submit receipts, and generate client reports.
              </p>
              <Link to="/home">
                <Button size="lg">
                  Sign In to WDT Expenses <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 px-6 border-t border-[var(--border-soft)]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 brand-gradient rounded-lg flex items-center justify-center">
              <Receipt className="w-3 h-3 text-white" />
            </div>
            <span className="font-semibold text-sm">WDT Expenses</span>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">© 2026 WDT. All rights reserved.</p>
          <Link to="/home" className="text-sm text-[var(--text-tertiary)] hover:text-white transition-colors">
            Sign In →
          </Link>
        </div>
      </footer>
    </div>
  );
}