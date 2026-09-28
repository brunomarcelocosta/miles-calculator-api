import { LeadsService } from './leads.service';
import { BadRequestException } from '@nestjs/common';
function fixture(){
 const lead: Record<string,unknown>={id:'v2',quizVersion:2,step:'lead',preferredChannel:'email',email:'ana@example.com',phone:null};
 const prisma={lead:{findUnique:jest.fn(async()=>lead),update:jest.fn(async({data}: {data:Record<string,unknown>})=>{Object.assign(lead,data);return lead}),create:jest.fn(),count:jest.fn(async()=>0)}};
 const service=new LeadsService(prisma as never,{get:()=> 'salt'} as never);
 const answer=(step:string,answer:unknown)=>service.updateStep('v2',{quizVersion:2,step,answer});
 return {lead,prisma,service,answer};
}
describe('v2 leads persistence',()=>{
 it('rejects hidden steps and completion with missing answers',async()=>{const f=fixture();await expect(f.answer('pointsProfile',{programs:['Livelo']})).rejects.toThrow(BadRequestException);await expect(f.service.complete('v2')).rejects.toThrow(BadRequestException)});
 it('preserves skip markers, clears branches on change, and completes without inventing estimates',async()=>{
  const f=fixture();
  for(const [step,value] of Object.entries({travelFrequency:'two_three',purchaseChannel:'airline',monthlySpend:'20_30k',mainCard:{concentration:'one',issuer:null},pointsRelationship:'frequent',hasPoints:'yes'}))await f.answer(step,value);
  await f.answer('pointsProfile',{programs:['Livelo'],amount:'unknown'});
  await f.answer('tripInMind','yes');await f.answer('tripDetails',{});
  // Revisiting an earlier answer must not lose an intentionally skipped optional trip form.
  await f.answer('monthlySpend','above_30k');
  const result=await f.service.complete('v2');expect(result).toHaveProperty('version',2);expect(result).toHaveProperty('segment','optimize');expect(result).not.toHaveProperty('estimate');expect(f.lead.completedAt).toBeInstanceOf(Date);
  await f.answer('hasPoints','no');expect(f.lead.pointsAmount).toBeNull();expect(f.lead.completedAt).toBeNull();
  await f.answer('tripInMind','no');expect(f.lead.tripDetailsSaved).toBe(false);expect(f.lead.tripDestination).toBeNull();
  await expect(f.service.complete('v2')).resolves.toHaveProperty('segment','optimize');
 });
 it('has no contact requirement on the unused channel and rejects version mismatch',async()=>{
  const f=fixture();await expect(f.answer('travelFrequency','one')).resolves.toBeDefined();f.lead.quizVersion=1;await expect(f.answer('travelFrequency','one')).rejects.toThrow(BadRequestException);
 });
 it('checks duplicate contacts by email or phone without matching nulls',async()=>{const f=fixture();await f.service.isDuplicate(null,'+14165550123');expect(f.prisma.lead.count).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({OR:[{phone:'+14165550123'}]})}))});
});
