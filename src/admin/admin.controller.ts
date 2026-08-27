import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@/auth/auth.guard';
import { PrismaService } from '@/prisma/prisma.service';

@Controller('admin')
@UseGuards(AuthGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /api/admin/leads
   *
   * Ordenação: novos (não validados) primeiro, depois por data desc.
   */
  @Get('leads')
  async listLeads(
    @Query('page') rawPage?: string,
    @Query('pageSize') rawPageSize?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const page = Math.max(1, parseInt(rawPage || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(rawPageSize || '20', 10) || 20));
    const skip = (page - 1) * pageSize;

    const where: Record<string, any> = {};

    if (search && search.trim().length > 0) {
      const term = search.trim();
      where.OR = [
        { fullName: { contains: term } },
        { email: { contains: term } },
        { phone: { contains: term } },
      ];
    }

    if (from || to) {
      where.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        if (isNaN(fromDate.getTime())) {
          throw new BadRequestException('Parâmetro "from" inválido.');
        }
        where.createdAt.gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (isNaN(toDate.getTime())) {
          throw new BadRequestException('Parâmetro "to" inválido.');
        }
        where.createdAt.lte = toDate;
      }
    }

    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        orderBy: [
          { validated: 'asc' },  
          { createdAt: 'desc' },
        ],
        skip,
        take: pageSize,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      data: leads,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * PATCH /api/admin/leads/:id/validate
   *
   * Toggle individual.
   */
  @Patch('leads/:id/validate')
  async toggleValidate(
    @Param('id') id: string,
    @Body() body: { validated: boolean },
  ) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException('Lead não encontrado.');
    }

    const validated = body.validated === true;

    await this.prisma.lead.update({
      where: { id },
      data: {
        validated,
        validatedAt: validated ? new Date() : null,
      },
    });

    return { ok: true, validated };
  }

  /**
   * PATCH /api/admin/leads/bulk-validate
   *
   * Valida (ou desvalida) múltiplos leads de uma vez.
   * Body: { ids: string[], validated: boolean }
   */
  @Patch('leads/bulk-validate')
  async bulkValidate(
    @Body() body: { ids: string[]; validated: boolean },
  ) {
    const { ids, validated } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('Lista de IDs é obrigatória.');
    }

    if (ids.length > 100) {
      throw new BadRequestException('Máximo de 100 leads por vez.');
    }

    await this.prisma.lead.updateMany({
      where: { id: { in: ids } },
      data: {
        validated: validated === true,
        validatedAt: validated ? new Date() : null,
      },
    });

    return { ok: true, count: ids.length };
  }
}
