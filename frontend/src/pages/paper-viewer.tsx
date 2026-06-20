import { AppLayout } from "@/components/layout/app-layout";
import { requireSupabase } from "@/lib/supabase";
import { ExternalLink, FileWarning } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "wouter";

type ViewerState = { title: string; url: string } | null;

export default function PaperViewer() {
  const { id } = useParams();
  const kind = new URLSearchParams(window.location.search).get("type") ?? "paper";
  const [asset, setAsset] = useState<ViewerState>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const client = requireSupabase();
        const { data: paper, error: paperError } = await client.from("papers")
          .select("id,title,storage_path,file_url,source_type,marking_schemes(storage_path)")
          .eq("id", Number(id)).single();
        if (paperError || !paper) throw new Error("PDF not found.");
        const schemes = paper.marking_schemes as unknown as Array<{ storage_path: string }> | null;
        const path = kind === "marking-scheme" ? schemes?.[0]?.storage_path : paper.storage_path ?? paper.file_url;
        const bucket = kind === "marking-scheme" ? "marking-schemes" : paper.source_type === "EXAMINER_REPORT" ? "examiner-reports" : "papers";
        if (!path) throw new Error("Missing file URL for this resource.");
        const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 60 * 60);
        if (error || !data?.signedUrl) throw new Error(error?.message.includes("not found") ? "PDF not found in Storage." : error?.message ?? "Access denied.");
        if (active) setAsset({ title: paper.title, url: data.signedUrl });
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load PDF.");
      }
    })();
    return () => { active = false; };
  }, [id, kind]);

  return <AppLayout><div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-2xl font-bold text-[#0B1F3A]">{asset?.title ?? "Paper viewer"}</h1><p className="text-sm text-gray-500">Secure signed link valid for one hour.</p></div>
      {asset && <a href={asset.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[#0B1F3A] px-4 py-2 text-sm font-semibold text-white">Open in New Tab <ExternalLink className="h-4 w-4" /></a>}
    </div>
    {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-700"><FileWarning className="mx-auto mb-3 h-8 w-8" />{error}</div> : asset ? <iframe title={asset.title} src={asset.url} className="h-[78vh] w-full rounded-2xl border bg-white" /> : <div className="p-12 text-center text-gray-500">Loading PDF…</div>}
  </div></AppLayout>;
}
