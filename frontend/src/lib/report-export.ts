export async function exportAnalyticsReport(input:{title:string;subtitle?:string;sections:Array<{title:string;rows:Array<[string,string|number]>}>}) {
  const{jsPDF}=await import("jspdf");const pdf=new jsPDF({unit:"mm",format:"a4"});const margin=16,usable=178;let y=18;
  pdf.setFillColor(11,31,58);pdf.roundedRect(margin,y,usable,30,4,4,"F");
  pdf.setTextColor(255);pdf.setFont("helvetica","bold");pdf.setFontSize(18);pdf.text("Parhai.com",margin+8,y+11);
  pdf.setFontSize(12);pdf.text(input.title,margin+8,y+21);y+=39;pdf.setTextColor(30);
  pdf.setFont("helvetica","normal");pdf.setFontSize(9);pdf.text(input.subtitle??`Generated ${new Date().toLocaleDateString()}`,margin,y);y+=9;
  for(const section of input.sections){
    if(y>265){pdf.addPage();y=18}pdf.setFont("helvetica","bold");pdf.setFontSize(13);pdf.text(section.title,margin,y);y+=7;
    pdf.setFont("helvetica","normal");pdf.setFontSize(10);
    for(const[label,value]of section.rows){if(y>280){pdf.addPage();y=18}pdf.setFillColor(246,248,251);pdf.roundedRect(margin,y-4,usable,8,1,1,"F");pdf.text(String(label),margin+3,y);pdf.text(String(value),190,y,{align:"right"});y+=10}
    y+=3;
  }
  pdf.setFontSize(8);pdf.setTextColor(110);pdf.text("Verified from uploaded Parhai exam data. Counts depend on indexed resource coverage.",margin,290);
  pdf.save(`${input.title.toLowerCase().replace(/[^a-z0-9]+/g,"-")||"parhai-report"}.pdf`);
}
