import { Link, Redirect } from "wouter";
import { motion } from "framer-motion";
import { FileText, Sparkles, Target, Trophy } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { BrandLogo } from "@/components/brand-logo";

export default function Landing() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (user) return <Redirect to="/dashboard" />;

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] text-[#0B1F3A]">
      <header className="container mx-auto px-4 h-20 flex items-center justify-between">
        <BrandLogo imageClassName="h-12 w-auto" />
        <nav className="hidden md:flex items-center gap-8 font-medium">
          <a href="#features" className="hover:text-[#0B1F3A] transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-[#0B1F3A] transition-colors">How it Works</a>
        </nav>
        <div className="flex items-center gap-4">
          <Link href="/login">
            <button className="font-semibold text-[#0B1F3A] px-4 py-2 hover:bg-[#0B1F3A]/5 rounded-lg transition-colors">
              Log in
            </button>
          </Link>
          <Link href="/login">
            <button className="bg-[#0B1F3A] hover:bg-[#0B1F3A]/90 text-white rounded-full px-6 py-2.5 shadow-md shadow-[#0B1F3A]/20 transition-colors font-semibold">
              Get Started
            </button>
          </Link>
        </div>
      </header>

      <section className="container mx-auto px-4 pt-20 pb-32 text-center max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white shadow-sm border border-cyan-100 mb-8">
            <Sparkles className="h-4 w-4 text-[#06B6D4]" />
            <span className="text-sm font-semibold text-[#0B1F3A]">A focused workspace for O/A Level study</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-tight">
            A cleaner way to organize exam <span className="text-[#0B1F3A]">prep.</span>
          </h1>
          <p className="text-xl text-[#0B1F3A]/70 mb-10 max-w-2xl mx-auto">
            Parhai keeps subjects, papers, notes, questions, and progress in one calm workspace for Cambridge students.
          </p>
          <Link href="/login">
            <button className="bg-[#06B6D4] hover:bg-[#06B6D4]/90 text-white rounded-full px-8 h-14 text-lg shadow-lg shadow-[#06B6D4]/25 transition-colors font-semibold">
              Start Learning for Free
            </button>
          </Link>
        </motion.div>
      </section>

      <section id="features" className="bg-white py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything you need in one place</h2>
            <p className="text-[#0B1F3A]/70 text-lg">Ditch the messy folders and scattered PDFs.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="bg-[#F8FAFC] p-8 rounded-3xl text-center">
              <div className="bg-[#0B1F3A] w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Target className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3">Topical Questions</h3>
              <p className="text-[#0B1F3A]/70">Group practice by topic so students can revise weak areas without digging through folders.</p>
            </div>

            <div className="bg-teal-50 p-8 rounded-3xl text-center">
              <div className="bg-[#14B8A6] w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <FileText className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3">Past Papers Library</h3>
              <p className="text-[#0B1F3A]/70">Upload and organize papers by subject, year, session, paper number, and resource type.</p>
            </div>

            <div className="bg-cyan-50 p-8 rounded-3xl text-center">
              <div className="bg-[#06B6D4] w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Trophy className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3">Tutor-ready workspace</h3>
              <p className="text-[#0B1F3A]/70">A dedicated place for guided help once your tutoring or AI provider is connected.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-24 container mx-auto px-4 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">Get started in minutes</h2>
        <p className="text-[#0B1F3A]/70 text-lg mb-16 max-w-xl mx-auto">Sign in, choose a level, and keep each subject's work in one place.</p>
        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {[
            { step: "1", title: "Sign in", desc: "Use Supabase Auth with email and password." },
            { step: "2", title: "Pick your subjects", desc: "Select your O Level or A Level subjects." },
            { step: "3", title: "Start studying", desc: "Open each subject workspace and work from real uploaded content." },
          ].map((s) => (
            <div key={s.step} className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[#0B1F3A] text-white font-bold text-lg flex items-center justify-center">
                {s.step}
              </div>
              <h3 className="text-xl font-bold">{s.title}</h3>
              <p className="text-[#0B1F3A]/70">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="bg-[#0B1F3A] text-white py-12 text-center">
        <div className="mb-6 flex justify-center">
          <div className="rounded-2xl bg-white px-5 py-3">
            <BrandLogo linked={false} imageClassName="h-12 w-auto" />
          </div>
        </div>
        <p className="text-white/60 mb-6">The modern study companion for Cambridge students.</p>
        <div className="text-sm text-white/40">
          � {new Date().getFullYear()} Parhai.com. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
