import { Atom, Binary, BookOpenText, Braces, Calculator, Dna, FlaskConical, Globe2, Landmark, Languages, Microscope } from "lucide-react";

const subjectVisuals = [
  { match:/physics/i, icon:Atom, from:"#0ea5e9", to:"#2563eb" },
  { match:/chem/i, icon:FlaskConical, from:"#f97316", to:"#ef4444" },
  { match:/bio/i, icon:Dna, from:"#10b981", to:"#059669" },
  { match:/math/i, icon:Calculator, from:"#8b5cf6", to:"#6d28d9" },
  { match:/computer|ict/i, icon:Braces, from:"#2563eb", to:"#4f46e5" },
  { match:/history/i, icon:Landmark, from:"#b45309", to:"#92400e" },
  { match:/geography/i, icon:Globe2, from:"#14b8a6", to:"#0f766e" },
  { match:/english|urdu|language/i, icon:Languages, from:"#ec4899", to:"#be185d" },
  { match:/science/i, icon:Microscope, from:"#06b6d4", to:"#0e7490" },
] as const;

export function SubjectMark({name,size="md",className=""}:{name:string;size?:"sm"|"md"|"lg";className?:string}) {
  const visual=subjectVisuals.find(item=>item.match.test(name))??{icon:BookOpenText,from:"#334155",to:"#0f172a"};
  const Icon=visual.icon;
  const dimensions=size==="lg"?"h-16 w-16 rounded-2xl":size==="sm"?"h-10 w-10 rounded-xl":"h-12 w-12 rounded-2xl";
  const iconSize=size==="lg"?"h-7 w-7":size==="sm"?"h-5 w-5":"h-6 w-6";
  return <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden text-white shadow-lg ${dimensions} ${className}`} style={{background:`linear-gradient(145deg,${visual.from},${visual.to})`}}>
    <span className="absolute -right-2 -top-3 h-8 w-8 rounded-full bg-white/20"/>
    <Icon className={`relative ${iconSize}`}/>
  </span>;
}
