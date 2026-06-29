import { ImagePlus, Loader2, Search, Send } from "lucide-react";

export function ChatComposer({ value, onChange, onSend, pending, placeholder }: { value: string; onChange: (value: string) => void; onSend: () => void; pending: boolean; placeholder: string }) {
  return <div className="sticky bottom-0 z-20 bg-gradient-to-t from-slate-50 via-slate-50/95 to-transparent px-3 pb-4 pt-8 sm:px-6">
    <div className="mx-auto max-w-4xl rounded-[22px] border border-slate-200 bg-white p-2 shadow-[0_16px_45px_rgba(15,23,42,.10)]">
      <div className="flex items-end gap-2"><textarea value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSend(); } }} rows={2} placeholder={placeholder} className="min-h-14 flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none" /><button onClick={onSend} disabled={!value.trim() || pending} className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40">{pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}</button></div>
      <div className="flex gap-2 border-t border-slate-100 px-2 pt-2"><button className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-50"><ImagePlus className="h-3.5 w-3.5" />Attach image</button><button className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-50"><Search className="h-3.5 w-3.5" />Search past papers</button></div>
    </div>
    <p className="mt-2 text-center text-[11px] text-slate-400">Enter to send · Shift + Enter for a new line</p>
  </div>;
}
