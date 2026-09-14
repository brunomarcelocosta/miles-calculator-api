import { Body, Controller, Get, Patch, Param, Query, UseGuards, Injectable, CanActivate, ExecutionContext, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class IntegrationGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('TRAVION_SERVICE_KEY');
    const received: unknown = context.switchToHttp().getRequest().headers['x-service-key'];
    if (!expected || expected.length < 32 || typeof received !== 'string' || received.length > 256) throw new UnauthorizedException();
    const digest = (value: string) => createHash('sha256').update(value).digest();
    if (!timingSafeEqual(digest(expected), digest(received))) throw new UnauthorizedException();
    return true;
  }
}
export const leadEditSchema = z.object({
  fullName: z.string().trim().min(1).max(160).optional(), email: z.email().max(180).optional(), phone: z.string().trim().min(5).max(20).optional(),
  instagram: z.string().max(60).nullable().optional(),
  cardPf: z.string().max(40).nullable().optional(), cardPj: z.string().max(40).nullable().optional(), uber: z.string().max(40).nullable().optional(), ifood: z.string().max(40).nullable().optional(),
  retailAnnual: z.string().max(40).nullable().optional(), travelAnnual: z.string().max(40).nullable().optional(), travelStyle: z.string().max(20).nullable().optional(), knowledgeLevel: z.string().max(40).nullable().optional(), freeTripsPerYear: z.string().max(20).nullable().optional(), managerInterest: z.string().max(40).nullable().optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Informe os campos para editar.');
const validation = z.object({ validated: z.boolean() }).strict();
const bulk = z.object({ ids: z.array(z.uuid()).min(1).max(100), validated: z.boolean() }).strict();
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const result = schema.safeParse(value); if (!result.success) throw new BadRequestException('Dados inválidos.'); return result.data; }

@Controller('integration/leads')
@UseGuards(IntegrationGuard)
@Throttle({ default: { limit: 240, ttl: 60000 } })
export class IntegrationController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  async list(@Query() query: Record<string, string>) {
    const page = Math.max(1, Number.parseInt(query.page || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize || '20', 10) || 20));
    const search = query.search?.trim().slice(0, 180);
    const date = (value: string, end = false) => { const d = new Date(value); if (Number.isNaN(d.getTime())) throw new BadRequestException('Data inválida.'); if (end && /^\d{4}-\d{2}-\d{2}$/.test(value)) d.setUTCHours(23, 59, 59, 999); return d; };
    const where = {
      ...(search ? { OR: [{ fullName: { contains: search } }, { email: { contains: search } }, { phone: { contains: search } }] } : {}),
      ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: date(query.from) } : {}), ...(query.to ? { lte: date(query.to, true) } : {}) } } : {}),
    };
    const [data, total] = await Promise.all([this.prisma.lead.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ validated: 'asc' }, { createdAt: 'desc' }] }), this.prisma.lead.count({ where })]);
    return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }
  @Patch('bulk-validate')
  async validateMany(@Body() body: unknown) { const value = parse(bulk, body); const result = await this.prisma.lead.updateMany({ where: { id: { in: value.ids } }, data: { validated: value.validated, validatedAt: value.validated ? new Date() : null } }); return { ok: true, count: result.count }; }
  @Patch(':id/validate')
  async validate(@Param('id') id: string, @Body() body: unknown) { const value = parse(validation, body); await this.exists(id); await this.prisma.lead.update({ where: { id }, data: { validated: value.validated, validatedAt: value.validated ? new Date() : null } }); return { ok: true }; }
  @Patch(':id')
  async edit(@Param('id') id: string, @Body() body: unknown) { await this.exists(id); const value = parse(leadEditSchema, body); return this.prisma.lead.update({ where: { id }, data: value }); }
  private async exists(id: string) { parse(z.uuid(), id); if (!await this.prisma.lead.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('Lead não encontrado.'); }
}
