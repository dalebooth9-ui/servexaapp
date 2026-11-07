import {describe,it,expect} from 'vitest';
import {buildingDuplicatePairs} from '@/lib/buildingDuplicates';
const building=(id:string,name:string,parent_id='site')=>({id,name,parent_id,site_type:'building'});
describe('duplicate buildings',()=>{
 it('finds all five Riverside empty flat-range copies',()=>{
   const blocks=[['B','21-47'],['C','48-68'],['E','95-124'],['F','125-141'],['G','142-165']];
   const rows=blocks.flatMap(([b,r])=>[building(b,`BLOCK ${b}`),building(b+'extra',`BLOCK ${b} ${r}`)]);
   const counts=new Map(rows.map(r=>[r.id,{assets:0}]));
   expect(buildingDuplicatePairs(rows,counts).map(p=>p.source.name)).toEqual(['BLOCK B 21-47','BLOCK C 48-68','BLOCK E 95-124','BLOCK F 125-141','BLOCK G 142-165']);
 });
 it('never matches different sites or partial block names',()=>{
  expect(buildingDuplicatePairs([building('a','BLOCK B'),building('b','BLOCK BB 21-47'),building('c','BLOCK B 21-47','elsewhere')],new Map(['a','b','c'].map(id=>[id,{assets:0}])))).toEqual([]);
 });
 it('does not offer either occupied building as an empty duplicate',()=>{
  expect(buildingDuplicatePairs([building('a','BLOCK B'),building('b','BLOCK B 21-47')],new Map(['a','b'].map(id=>[id,{assets:1}])))).toEqual([]);
 });
 it('keeps the occupied copy when only the shorter name is empty',()=>{
  expect(buildingDuplicatePairs([building('a','BLOCK B'),building('b','BLOCK B 21-47')],new Map([['a',{assets:0}],['b',{assets:1}]]))[0]?.source.id).toBe('a');
 });
 it('waits for real dependency counts rather than assuming empty',()=>{
  expect(buildingDuplicatePairs([building('a','BLOCK B'),building('b','BLOCK B 21-47')],new Map())).toEqual([]);
 });
});