import"dotenv/config";
import{supabaseAdmin}from"../lib/supabase";
import{createExamEngine}from"../services/exam-engine";
import{parseStudentPromptToQuery,validateSourceAgainstParsedQuery}from"../services/source-grounded-query";

const prompts=[
  "Find calculation-based questions from O Level Physics 5054 Paper 2 from 2020 to 2024. Show marks, topic, difficulty, and source.",
  "Find Light questions from O Level Physics 5054 from 2020 to 2024.",
  "Find Electricity questions from O Level Physics 5054 from 2021 to 2024.",
  "Show only Light questions with official marking schemes linked.",
  "Find O Level Mathematics 4024 Paper 1 May/June 2023 questions.",
  "Find A Level Physics 9702 Paper 4 questions from 2020 to 2024.",
];
const engine=createExamEngine(supabaseAdmin),report=[];
for(const prompt of prompts){
  const query=parseStudentPromptToQuery(prompt);
  const result=await engine.findQuestions({
    subjectCode:query.syllabusCode??undefined,yearFrom:query.yearStart??undefined,yearTo:query.yearEnd??undefined,
    session:query.session??undefined,paperNumber:query.paperNumber??undefined,variant:query.variant??undefined,
    topic:query.topic??undefined,questionType:query.questionType??undefined,markingSchemeOnly:query.markingSchemeRequired,
    limit:50,
  });
  const checked=result.rows.map((row:any)=>{
    const subject=Array.isArray(row.subjects)?row.subjects[0]:row.subjects;
    return{id:row.id,paper:row.paper_code,topic:row.topic,type:row.question_type,...validateSourceAgainstParsedQuery({...row,subject_code:subject?.code,level:subject?.level},query)};
  });
  const rejected=checked.filter(row=>!row.valid);
  report.push({prompt,parsedQuery:query,candidates:result.rows.length,valid:checked.length-rejected.length,rejected,pass:rejected.length===0});
}
console.log(JSON.stringify({passed:report.filter(row=>row.pass).length,total:report.length,report},null,2));
