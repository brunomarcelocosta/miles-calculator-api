import { leadEditSchema, IntegrationGuard } from './integration.controller';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
describe('Travion integration', () => {
  it('rejects mass assignment and invalid contact data', () => {
    expect(leadEditSchema.safeParse({ fullName: 'Ana', validated: true }).success).toBe(false);
    expect(leadEditSchema.safeParse({ email: 'invalid' }).success).toBe(false);
    expect(leadEditSchema.safeParse({ email: 'ana@example.com', phone: '11999999999' }).success).toBe(true);
    expect(leadEditSchema.safeParse({}).success).toBe(false);
  });
  it('requires a configured service key and rejects wrong keys', () => {
    const key = 'a'.repeat(64);
    const context = (value: string) => ({ switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-service-key': value } }) }) }) as ExecutionContext;
    const guard = new IntegrationGuard(new ConfigService({ TRAVION_SERVICE_KEY: key }));
    expect(guard.canActivate(context(key))).toBe(true);
    expect(() => guard.canActivate(context('b'.repeat(64)))).toThrow();
    expect(() => new IntegrationGuard(new ConfigService()).canActivate(context(key))).toThrow();
  });
});
