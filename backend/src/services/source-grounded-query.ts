export const QUESTION_TYPES=["calculation","theory","diagram","graph","definition","explanation","data_table","practical","mixed","unknown"] as const;
export type QuestionType=typeof QUESTION_TYPES[number];

export type ParsedStudentQuery={
  intent:"find_questions"|"explain_question"|"marking_scheme"|"generate_worksheet"|"analyze_paper"|"repeated_topics"|"revision_plan"|"mark_answer"|"compare_topics"|"common_mistakes"|"unknown";
  level:"O_LEVEL"|"AS_LEVEL"|"A_LEVEL"|null;
  subject:string|null;
  syllabusCode:string|null;
  yearStart:number|null;
  yearEnd:number|null;
  session:"MAY_JUNE"|"OCT_NOV"|"FEB_MAR"|null;
  paperNumber:number|null;
  variant:number|null;
  componentVariantCode:string|null;
  topic:string|null;
  subtopic:string|null;
  questionType:QuestionType|null;
  markingSchemeRequired:boolean;
  sourceRequired:boolean;
  verifiedOnly:boolean;
};

const SUBJECTS=[
  {name:"Mathematics",code:"4024",aliases:/\b(?:maths?|mathematics(?:\s+syllabus\s+d)?|4024)\b/i},
  {name:"Physics",code:"5054",aliases:/\b(?:physics|phy|5054)\b/i},
  {name:"Computer Science",code:"2210",aliases:/\b(?:computer\s+science|computing|2210)\b/i},
  {name:"Physics",code:"9702",aliases:/\b(?:a\s*level\s+physics|9702)\b/i},
  {name:"Mathematics",code:"9709",aliases:/\b(?:a\s*level\s+(?:maths?|mathematics)|9709)\b/i},
  {name:"Chemistry",code:"9701",aliases:/\b(?:a\s*level\s+chemistry|9701)\b/i},
  {name:"Biology",code:"9700",aliases:/\b(?:a\s*level\s+biology|9700)\b/i},
  {name:"Chemistry",code:"5070",aliases:/\b(?:chemistry|5070)\b/i},
] as const;

function detectIntent(prompt:string):ParsedStudentQuery["intent"]{
  if(/\b(mark|check|grade)\b.*\b(answer|paper)\b/i.test(prompt))return"mark_answer";
  if(/\bworksheet|practice set\b/i.test(prompt))return"generate_worksheet";
  if(/\b(analy[sz]e|breakdown)\b.*\bpaper\b/i.test(prompt))return"analyze_paper";
  if(/\b(repeated|common|frequent)\b.*\b(topic|question|pattern)\b/i.test(prompt))return"repeated_topics";
  if(/\brevision plan\b/i.test(prompt))return"revision_plan";
  if(/\bcompare\b.*\btopic/i.test(prompt))return"compare_topics";
  if(/\bcommon mistakes?\b/i.test(prompt))return"common_mistakes";
  if(/\bmark(?:ing)? scheme|mark scheme|marking points?\b/i.test(prompt))return"marking_scheme";
  if(/\bexplain\b.*\b(?:question|q\s*\d+|this)\b/i.test(prompt))return"explain_question";
  if(/\b(question|find|show|give)\b/i.test(prompt))return"find_questions";
  return"unknown";
}

export function classifyQuestionTypeDetailed(text:string){
  const value=text.toLowerCase(),types=new Set<QuestionType>();
  if(/\b(calculate|determine|work out|find the value|use (?:the )?formula|numerical answer|significant figures?|percentage|ratio)\b/.test(value))types.add("calculation");
  if(/\b(draw|complete|label|sketch)\b.{0,35}\b(diagram|circuit|ray|apparatus)\b|\b(ray|circuit) diagram\b/.test(value))types.add("diagram");
  if(/\b(plot|graph|gradient|axes?|curve|line of best fit)\b/.test(value))types.add("graph");
  if(/\bdefine\b|\bwhat is meant by\b/.test(value))types.add("definition");
  if(/\b(explain|describe|suggest|compare|give a reason|why)\b/.test(value))types.add("explanation");
  if(/\b(table|data|readings|results)\b/.test(value))types.add("data_table");
  if(/\b(practical|experiment|apparatus|investigate|procedure)\b/.test(value))types.add("practical");
  if(!types.size&&/\b(state|name|give|write|identify)\b/.test(value))types.add("theory");
  const subtypes=[...types],questionType:QuestionType=subtypes.length>1?"mixed":subtypes[0]??"unknown";
  const confidence=questionType==="unknown"?0.25:questionType==="mixed"?0.88:0.92;
  return{questionType,subtypes,confidence,needsReview:confidence<0.6,reason:subtypes.length?`Matched ${subtypes.join(", ")} command/evidence terms.`:"No reliable question-type command word found."};
}

export function parseStudentPromptToQuery(prompt:string,currentContext:Partial<ParsedStudentQuery>={}):ParsedStudentQuery{
  const explicitCode=prompt.match(/\b(\d{4})\b/)?.[1];
  const subject=SUBJECTS.find(item=>item.code===explicitCode)??SUBJECTS.find(item=>item.aliases.test(prompt));
  const years=[...prompt.matchAll(/\b((?:19|20)\d{2})\b/g)].map(match=>Number(match[1]));
  const component=prompt.match(/\b(?:paper|component|p)\s*(\d)(?:\s*(?:variant|v)\s*(\d))?\b/i);
  const filename=prompt.match(/\b(\d{4})_[smw](\d{2})_(?:qp|ms)_(\d)(\d)\b/i);
  const paperNumber=Number(filename?.[3]??component?.[1]??0)||null;
  const variant=Number(filename?.[4]??component?.[2]??0)||null;
  const lower=prompt.toLowerCase();
  const session=lower.includes("may/june")||lower.includes("may june")?"MAY_JUNE":lower.includes("oct/nov")||lower.includes("oct nov")?"OCT_NOV":lower.includes("feb/march")||lower.includes("feb march")?"FEB_MAR":null;
  const questionType=/\bcalculat(?:ion|e|ing)(?:-based)?\b/i.test(prompt)?"calculation":/\bdiagram\b/i.test(prompt)?"diagram":/\bgraph\b/i.test(prompt)?"graph":/\bdefinition\b/i.test(prompt)?"definition":/\bexplanation|theory\b/i.test(prompt)?"explanation":null;
  const level=/\bAS Level\b/i.test(prompt)?"AS_LEVEL":/\bA Level\b/i.test(prompt)?"A_LEVEL":/\bO Level\b/i.test(prompt)?"O_LEVEL":subject?.code.startsWith("97")?"A_LEVEL":null;
  const topic=/\blight\b/i.test(prompt)?"Light":/\belectricity\b/i.test(prompt)?"Electricity":/\benergy\b/i.test(prompt)?"Energy":/\bmotion\b/i.test(prompt)?"Motion":/\bcircle theorem|circles?\b/i.test(prompt)?"Circle Theorems":/\bgraphs?(?: and functions)?\b/i.test(prompt)?"Graphs and Functions":/\balgebra\b/i.test(prompt)?"Algebra":null;
  return{
    intent:detectIntent(prompt),level:level??currentContext.level??null,subject:subject?.name??currentContext.subject??null,
    syllabusCode:filename?.[1]??subject?.code??currentContext.syllabusCode??null,
    yearStart:years.length?Math.min(...years):currentContext.yearStart??null,
    yearEnd:years.length?Math.max(...years):currentContext.yearEnd??null,
    session:session??currentContext.session??null,paperNumber:paperNumber??currentContext.paperNumber??null,
    variant:variant??currentContext.variant??null,componentVariantCode:paperNumber&&variant?`${paperNumber}${variant}`:null,
    topic:topic??currentContext.topic??null,subtopic:currentContext.subtopic??null,questionType:questionType??currentContext.questionType??null,
    markingSchemeRequired:/\b(?:only\s+)?with (?:an? )?(?:official )?(?:marking|mark) scheme|official marking scheme linked\b/i.test(prompt),
    sourceRequired:/\bsource\b/i.test(prompt),verifiedOnly:true,
  };
}

export function validateSourceAgainstParsedQuery(source:Record<string,any>,query:ParsedStudentQuery){
  const reasons:string[]=[];
  const value=(...keys:string[])=>keys.map(key=>source[key]).find(item=>item!==null&&item!==undefined);
  if(query.syllabusCode&&String(value("syllabus_code","subject_code","subjectCode","code")??"")!==query.syllabusCode)reasons.push(`syllabus_code does not match requested ${query.syllabusCode}`);
  if(query.level&&String(value("level")??"").replace(/\s+/g,"_").toUpperCase()!==query.level)reasons.push(`level does not match requested ${query.level}`);
  const year=Number(value("year"));
  if(query.yearStart&&year<query.yearStart)reasons.push(`year ${year} is before ${query.yearStart}`);
  if(query.yearEnd&&year>query.yearEnd)reasons.push(`year ${year} is after ${query.yearEnd}`);
  if(query.session&&String(value("session")??"").toUpperCase()!==query.session)reasons.push(`session does not match requested ${query.session}`);
  if(query.paperNumber&&Number(value("paper_number","paper_code","paperNumber"))!==query.paperNumber)reasons.push(`paper_number ${value("paper_number","paper_code","paperNumber")} does not match requested ${query.paperNumber}`);
  if(query.variant&&Number(value("variant"))!==query.variant)reasons.push(`variant does not match requested ${query.variant}`);
  if(query.topic&&String(value("topic")??"").toLowerCase()!==query.topic.toLowerCase())reasons.push(`topic does not match requested ${query.topic}`);
  const actualType=String(value("question_type","questionType")??"unknown").replace(/-based$/,"").replace("data/table","data_table");
  const subtypes=Array.isArray(source.question_type_metadata?.subtypes)?source.question_type_metadata.subtypes:[];
  if(query.questionType&&actualType!==query.questionType&&actualType!=="mixed"&&!subtypes.includes(query.questionType))reasons.push(`question_type ${actualType} does not match requested ${query.questionType}`);
  if(query.markingSchemeRequired&&!["linked","linked_exact"].includes(String(value("marking_scheme_link_status","markingSchemeLinkStatus"))))reasons.push("question-specific marking scheme is not linked");
  if(query.verifiedOnly&&(source.needs_review===true||source.student_verified===false||source.verification_status==="rejected"))reasons.push("source is not student-verified");
  return{valid:reasons.length===0,reasons};
}
