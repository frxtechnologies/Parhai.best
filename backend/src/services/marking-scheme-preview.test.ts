import assert from "node:assert/strict";
import test from "node:test";
import {findMarkingSchemeRow,normalizeMarkingSchemeLabel} from "./marking-scheme-preview";

test("normalizes Cambridge marking scheme labels",()=>{
  assert.equal(normalizeMarkingSchemeLabel("4 (a) (i)"),"4(a)(i)");
});

test("finds a question part split across PDF text items",()=>{
  const result=findMarkingSchemeRow([
    {text:"4",x:20,y:100},
    {text:"(a)",x:45,y:101},
    {text:"(i)",x:75,y:99},
    {text:"ray bends towards normal",x:130,y:100},
    {text:"4",x:20,y:180},
    {text:"(a)",x:45,y:180},
    {text:"(ii)",x:75,y:180},
  ],"4","(a)(i)");
  assert.deepEqual(result,{y:81,nextY:180});
});

test("does not confuse adjacent question parts",()=>{
  assert.equal(findMarkingSchemeRow([
    {text:"4",x:20,y:100},
    {text:"(a)",x:45,y:100},
    {text:"(ii)",x:75,y:100},
  ],"4","(a)(i)"),null);
});
