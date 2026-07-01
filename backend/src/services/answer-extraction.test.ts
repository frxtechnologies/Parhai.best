import test from "node:test";
import assert from "node:assert/strict";
import { AnswerExtractionService,type AnswerExtractionProvider } from "./answer-extraction";
test("falls back honestly when handwriting OCR is unavailable",async()=>{const provider:AnswerExtractionProvider={name:"none",async extract(){return{provider:"none",status:"needs_manual_review",message:"review",answers:[]}}};const result=await new AnswerExtractionService([provider]).extract(Buffer.from("scan"));assert.equal(result.status,"needs_manual_review");});
