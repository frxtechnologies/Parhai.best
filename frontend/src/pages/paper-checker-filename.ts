export type FileHints={year:number|null;paper:number|null;variant:number|null};
export type SelectedPaperHint={year:number;paper_number:number|null;variant:number};

export function filenameHints(name:string):FileHints{
  const lower=name.toLowerCase();
  const yearCode=lower.match(/(?:^|[^0-9])((?:20)?[0-9]{2})(?:[^0-9]|$)/);
  const paper=lower.match(/(?:paper|p)\s*[-_]?\s*([1-9])/i);
  const variant=lower.match(/(?:variant|v)\s*[-_]?\s*([1-9])/i);
  const parsedYear=yearCode?Number(yearCode[1]):null;
  return {
    year:parsedYear&&parsedYear<100?2000+parsedYear:parsedYear,
    paper:paper?Number(paper[1]):null,
    variant:variant?Number(variant[1]):null,
  };
}

export function mismatchMessage(paper:SelectedPaperHint|undefined,fileName:string|undefined,hints:FileHints){
  if(!paper||!fileName)return "";
  const differences:string[]=[];
  if(hints.paper&&paper.paper_number&&hints.paper!==paper.paper_number)differences.push(`Paper ${hints.paper} instead of Paper ${paper.paper_number}`);
  if(hints.year&&hints.year!==paper.year)differences.push(`${hints.year} instead of ${paper.year}`);
  if(hints.variant&&hints.variant!==paper.variant)differences.push(`Variant ${hints.variant} instead of Variant ${paper.variant}`);
  return differences.length?`Your file name looks like ${differences.join(" and ")}. Please confirm you selected the correct Cambridge paper.`:"";
}
