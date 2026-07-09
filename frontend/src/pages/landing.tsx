import { Link, Redirect } from "wouter";
import { motion } from "framer-motion";
import { Bot, FileText, Sparkles, Target, Trophy, Zap, ArrowRight, CheckCircle, ScanText, ClipboardCheck, BookOpen } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { BrandLogo } from "@/components/brand-logo";

export default function Landing() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (user) return <Redirect to="/dashboard" />;

  return (
    <div className="min-h-[100dvh] text-[#0B1F3A] overflow-x-hidden">

      {/* ── NAV ── */}
      <nav className="hero-mesh sticky top-0 z-50 border-b border-white/[0.06]">
        <div className="container mx-auto px-4 h-18 flex items-center justify-between py-4">
          <BrandLogo imageClassName="h-11 w-auto brightness-0 invert opacity-95" />
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How it Works</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <button className="text-sm font-semibold text-slate-300 px-4 py-2 rounded-xl hover:bg-white/10 transition-colors">
                Log in
              </button>
            </Link>
            <Link href="/login">
              <button className="btn-glow bg-gradient-to-r from-cyan-500 to-teal-500 text-white text-sm font-semibold rounded-xl px-5 py-2.5 shadow-lg shadow-cyan-500/25">
                Get Started
              </button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="hero-mesh relative overflow-hidden pt-24 pb-36 text-center">
        {/* Background decorative orbs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-cyan-500/[0.08] blur-3xl" />
          <div className="absolute top-1/3 right-1/4 h-80 w-80 rounded-full bg-teal-500/[0.07] blur-3xl" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-64 w-[80%] rounded-full bg-indigo-500/[0.05] blur-3xl" />
        </div>

        {/* Grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        <div className="relative container mx-auto px-4 max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 mb-8">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              <span className="text-sm font-semibold text-cyan-300">AI-powered Cambridge exam prep</span>
            </div>

            {/* Headline */}
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.08] text-white mb-6">
              Study smarter for{" "}
              <span className="gradient-text-light">Cambridge</span>
              <br className="hidden md:block" /> exams.
            </h1>

            <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
              Parhai brings your subjects, past papers, notes, and AI tutor into one focused workspace — so you can stop searching and start learning.
            </p>

            {/* CTA row */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/login">
                <button className="btn-glow bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-bold rounded-xl px-8 h-14 text-base shadow-2xl shadow-cyan-500/30 flex items-center gap-2">
                  Start for free <ArrowRight className="h-5 w-5" />
                </button>
              </Link>
              <a href="#features" className="text-sm font-semibold text-slate-400 hover:text-white transition-colors flex items-center gap-1.5">
                See what's included <ArrowRight className="h-4 w-4" />
              </a>
            </div>

            {/* Social proof badges */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-500">
              {["O Level & A Level", "Cambridge Board", "AI-Grounded Answers", "Paper Checker"].map((tag) => (
                <span key={tag} className="flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 text-teal-400" />
                  {tag}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="bg-[#F1F5FA] py-28">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <p className="text-xs font-bold uppercase tracking-widest text-cyan-600 mb-3">Platform features</p>
            <h2 className="text-3xl md:text-5xl font-bold text-[#0B1F3A] mb-4">Everything in one place</h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">No more scattered PDFs or messy folders. Parhai is your complete Cambridge study hub.</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.07 }}
                className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm card-lift"
              >
                <div className={`absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-r ${f.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${f.gradient} text-white mb-5 shadow-lg`} style={{ boxShadow: `0 6px 20px ${f.glow}` }}>
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-[#0B1F3A] mb-2">{f.title}</h3>
                <p className="text-sm text-slate-500 leading-6">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="bg-white py-28">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-xs font-bold uppercase tracking-widest text-teal-600 mb-3">Getting started</p>
            <h2 className="text-3xl md:text-5xl font-bold text-[#0B1F3A] mb-4">Up and running in minutes</h2>
            <p className="text-slate-500 text-lg mb-16 max-w-xl mx-auto">Sign in, choose your level, and your personalised study workspace is ready.</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="flex flex-col items-center gap-4"
              >
                <div className="relative">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0B1F3A] to-[#0D3060] text-white font-bold text-xl flex items-center justify-center shadow-lg shadow-[#0B1F3A]/20">
                    {s.step}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="hidden md:block absolute left-full top-1/2 -translate-y-1/2 w-full h-px bg-gradient-to-r from-slate-300 to-transparent ml-4" />
                  )}
                </div>
                <h3 className="text-xl font-bold text-[#0B1F3A]">{s.title}</h3>
                <p className="text-slate-500 text-sm max-w-[200px] leading-6">{s.desc}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-16"
          >
            <Link href="/login">
              <button className="btn-primary-glow inline-flex items-center gap-2 bg-[#0B1F3A] text-white font-bold rounded-xl px-8 h-14 text-base shadow-xl shadow-[#0B1F3A]/20">
                Start Learning for Free <ArrowRight className="h-5 w-5" />
              </button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="hero-mesh border-t border-white/[0.06] py-14">
        <div className="container mx-auto px-4 text-center">
          <div className="mb-6 flex justify-center">
            <BrandLogo linked={false} imageClassName="h-12 w-auto brightness-0 invert opacity-80" />
          </div>
          <p className="text-slate-500 mb-6 text-sm">The modern AI study companion for Cambridge students.</p>
          <p className="text-sm text-slate-600">&copy; {new Date().getFullYear()} Parhai.com. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

const FEATURES = [
  {
    title: "AI Tutor",
    desc: "Ask questions and get grounded, citation-backed answers from your subject's past papers, marking schemes, and examiner reports.",
    icon: Bot,
    gradient: "from-cyan-500 to-sky-500",
    glow: "rgba(6,182,212,0.20)",
  },
  {
    title: "Question Solver",
    desc: "Photograph any exam question. Our vision AI extracts, retrieves matching context, and walks you through a step-by-step solution.",
    icon: ScanText,
    gradient: "from-violet-500 to-purple-500",
    glow: "rgba(139,92,246,0.20)",
  },
  {
    title: "AI Notes Generator",
    desc: "Generate summaries, flashcards, formula sheets, memory tricks, or last-minute checklists for any topic with one click.",
    icon: Sparkles,
    gradient: "from-teal-500 to-emerald-500",
    glow: "rgba(20,184,166,0.20)",
  },
  {
    title: "Paper Checker",
    desc: "Upload your completed answer sheet. The AI marks it against the official scheme, estimates a grade, and shows exactly where marks were lost.",
    icon: ClipboardCheck,
    gradient: "from-orange-500 to-amber-500",
    glow: "rgba(249,115,22,0.20)",
  },
  {
    title: "Past Papers Library",
    desc: "Upload and browse papers by subject, year, session, paper number, and type. Marking schemes always one click away.",
    icon: FileText,
    gradient: "from-blue-500 to-indigo-500",
    glow: "rgba(59,130,246,0.20)",
  },
  {
    title: "Topical Questions",
    desc: "Practice by topic so you can target weak areas without digging through endless folders. Progress tracked automatically.",
    icon: Target,
    gradient: "from-pink-500 to-rose-500",
    glow: "rgba(236,72,153,0.20)",
  },
];

const STEPS = [
  { step: "1", title: "Sign in",          desc: "Create an account with email or Google in under 30 seconds." },
  { step: "2", title: "Pick your subjects",desc: "Select your O Level or A Level subjects and your exam board." },
  { step: "3", title: "Start studying",    desc: "Open each subject workspace and work from real Cambridge content." },
];
