import type { AiSource } from "@/api/types";

async function imageData(url: string) {
  const response = await fetch(url);
  if (!response.ok) return null;
  const blob = await response.blob();
  return await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export async function exportQuestionWorksheet(title: string, sources: AiSource[], includeAnswers: boolean) {
  const { jsPDF } = await import("jspdf");
  const questions = sources.filter((source) => source.sourceType === "question" && source.questionText);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const width = 210, margin = 16, usable = width - margin * 2;
  let y = 18;
  const pageCheck = (needed: number) => { if (y + needed > 282) { pdf.addPage(); y = 18; } };
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(16); pdf.text(title, margin, y); y += 9;
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(90);
  pdf.text(`${questions.length} verified questions generated from Parhai.com`, margin, y); y += 10; pdf.setTextColor(20);
  for (let index = 0; index < questions.length; index += 1) {
    const source = questions[index]!;
    pageCheck(35);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(11);
    pdf.text(`${index + 1}. Question ${source.questionNumber ?? ""}  ${source.topic ?? ""}${source.subtopic ? ` / ${source.subtopic}` : ""}`, margin, y); y += 6;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(100);
    pdf.text(`${source.reference.replace(/^\[S\d+\]\s*/, "")}  ${source.difficulty ?? ""}  ${source.marks ?? "-"} marks`, margin, y); y += 5; pdf.setTextColor(20);
    if (source.screenshotUrl) {
      try { const image = await imageData(source.screenshotUrl); if (image) { pageCheck(62); pdf.addImage(image, "PNG", margin, y, usable, 58, undefined, "FAST"); y += 63; } } catch { /* text fallback remains */ }
    }
    const lines = pdf.splitTextToSize(source.questionText!, usable);
    pageCheck(lines.length * 4 + 8); pdf.setFontSize(10); pdf.text(lines, margin, y); y += lines.length * 4 + 8;
  }
  if (includeAnswers) {
    pdf.addPage(); y = 18; pdf.setFont("helvetica", "bold"); pdf.setFontSize(15); pdf.text("Marking scheme answers", margin, y); y += 10;
    questions.forEach((source, index) => { const lines = pdf.splitTextToSize(source.answerText ?? "No linked marking-scheme answer available.", usable); pageCheck(lines.length * 4 + 10); pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.text(`${index + 1}. Question ${source.questionNumber ?? ""}`, margin, y); y += 5; pdf.setFont("helvetica", "normal"); pdf.text(lines, margin, y); y += lines.length * 4 + 7; });
  }
  pdf.save(`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "parhai-worksheet"}.pdf`);
}
