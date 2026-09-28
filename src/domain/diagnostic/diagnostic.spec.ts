import { answerSchemas, cleanAnswers, diagnosticResult, visibleQuestions, catalog } from './diagnostic';
import { createLeadSchema } from '@/leads/dto/create-lead.dto';
const base = {travelFrequency:'two_three',purchaseChannel:'airline',monthlySpend:'20_30k',mainCard:{concentration:'one',issuer:'Itaú'},pointsRelationship:'none',hasPoints:'yes',tripInMind:'no'};
describe('diagnostic v2',()=>{
 it('publishes seven main questions and two conditional groups',()=>{expect(catalog.version).toBe(2);expect(visibleQuestions(base)).toHaveLength(7)});
 it('only asks programs when the user knows points and has a likely balance',()=>{
  for(const relation of ['none','unused','sometimes','frequent'])for(const balance of ['yes','maybe','no','unknown']){
   const ids=visibleQuestions({...base,pointsRelationship:relation,hasPoints:balance}).map(q=>q.id);
   expect(ids.includes('pointsProfile')).toBe(relation!=='none'&&['yes','maybe'].includes(balance));
  }
 });
 it('clears stale branch answers',()=>{expect(cleanAnswers({...base,pointsProfile:{programs:['Livelo']},tripDetails:{destination:'Europa'}})).toEqual(base)});
 it('keeps experience independent of available balance',()=>{
  expect(diagnosticResult({...base,pointsRelationship:'frequent',hasPoints:'no'}).segment).toBe('optimize');
  expect(diagnosticResult({...base,pointsRelationship:'unused'}).segment).toBe('activate');
  expect(diagnosticResult(base).segment).toBe('educate');
 });
 it('has different useful conclusions and no invented estimates',()=>{
  const results=['none','unused','frequent'].map(pointsRelationship=>diagnosticResult({...base,pointsRelationship}));
  expect(new Set(results.map(r=>r.conclusion)).size).toBe(3);
  for(const r of results){expect(r.indicators).toHaveLength(3);expect(r).not.toHaveProperty('estimate')}
 });
 it('validates arrays, grouped data, and unknown codes',()=>{
  expect(answerSchemas.pointsProfile!.safeParse({programs:['Livelo'],amount:'unknown'}).success).toBe(true);
  expect(answerSchemas.pointsProfile!.safeParse({programs:['Livelo','Livelo']}).success).toBe(false);
  expect(answerSchemas.pointsProfile!.safeParse({programs:['Livelo','Não sei o programa']}).success).toBe(false);
  expect(answerSchemas.tripDetails!.safeParse({}).success).toBe(true);
  expect(answerSchemas.tripDetails!.safeParse({destination:'Europa',other:'Paris'}).success).toBe(false);
  expect(answerSchemas.monthlySpend!.safeParse('pf_upto_10k').success).toBe(false);
 });
 it('accepts one name and the selected channel only',()=>{
  const common={quizVersion:2,fullName:'Ana',consentAt:'2026-09-28T18:00:00.000Z'};
  expect(createLeadSchema.safeParse({...common,preferredChannel:'whatsapp',phone:'+14165550123'}).success).toBe(true);
  expect(createLeadSchema.safeParse({...common,preferredChannel:'email',email:'ana@example.com'}).success).toBe(true);
  expect(createLeadSchema.safeParse({...common,preferredChannel:'whatsapp',email:'ana@example.com'}).success).toBe(false);
  expect(createLeadSchema.safeParse({...common,preferredChannel:'email',phone:'+14165550123'}).success).toBe(false);
 });
});
