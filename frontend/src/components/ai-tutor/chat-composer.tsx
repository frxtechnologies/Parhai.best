import { ImagePlus, Loader2, Search, Send } from "lucide-react";
import { useEffect, useRef } from "react";

export function ChatComposer({
  value,
  onChange,
  onSend,
  pending,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  pending: boolean;
  placeholder: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  return (
    <div
      className="sticky bottom-0 z-20 px-3 pb-5 pt-6 sm:px-6"
      style={{ background: "linear-gradient(to top, var(--background) 65%, transparent)" }}
    >
      <div className="mx-auto max-w-3xl">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_40px_rgba(99,102,241,0.10)] transition-all focus-within:border-indigo-300 focus-within:shadow-[0_8px_40px_rgba(99,102,241,0.18)]">
          <div className="flex items-end gap-2 px-4 pb-2 pt-4">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={e => onChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              rows={1}
              placeholder={placeholder}
              className="flex-1 resize-none bg-transparent text-[15px] leading-6 text-[#1E1B4B] outline-none placeholder:text-slate-400"
              style={{ maxHeight: "200px", minHeight: "28px" }}
            />
            <button
              onClick={onSend}
              disabled={!value.trim() || pending}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:opacity-40"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex items-center gap-1 border-t border-slate-100 px-3 py-2">
            <button className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium text-[12px] text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
              <ImagePlus className="h-3.5 w-3.5" />
              Attach image
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium text-[12px] text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
              <Search className="h-3.5 w-3.5" />
              Search papers
            </button>
            <span className="ml-auto pr-1 text-[11px] text-slate-400">Enter to send · ⇧Enter for new line</span>
          </div>
        </div>
      </div>
    </div>
  );
}
