import {
  Controller,
  Post,
  Patch,
  Param,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { createLeadSchema } from './dto/create-lead.dto';
import { updateLeadStepSchema } from './dto/update-lead-step.dto';
import { LeadsService } from './leads.service';

@Controller('leads')
export class LeadsController {
  private readonly logger = new Logger(LeadsController.name);

  constructor(private readonly leadsService: LeadsService) {}

  /**
   * POST /api/leads — cria lead após preenchimento do formulário de contato.
   * Rate limit: 5 por minuto por IP.
   */
  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown, @Req() req: Request) {
    const parsed = createLeadSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Dados inválidos.',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const dto = parsed.data;

    // Honeypot — retorna 201 fake para não dar dica ao bot
    if (dto.honeypot && dto.honeypot.length > 0) {
      this.logger.warn(`Honeypot triggered from IP ${this.extractIp(req)}`);
      return { id: '00000000-0000-0000-0000-000000000000' };
    }

    // Plausibilidade: duplicata recente
    const isDup = await this.leadsService.isDuplicate(dto.email);
    if (isDup) {
      throw new ConflictException(
        'Você já enviou seus dados há pouco. Aguarde alguns minutos.',
      );
    }

    const ip = this.extractIp(req);
    const userAgent = req.headers['user-agent'];

    const lead = await this.leadsService.create(dto, ip, userAgent);

    this.logger.log(`Lead created: ${lead.id} (${dto.email})`);

    return { id: lead.id };
  }

  /**
   * PATCH /api/leads/:id/step — atualiza step e resposta a cada tela do quiz.
   * Rate limit mais permissivo (10 perguntas rápidas).
   */
  @Patch(':id/step')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @HttpCode(HttpStatus.OK)
  async updateStep(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    // Validar que o lead existe
    const existing = await this.leadsService.findById(id);
    if (!existing) {
      throw new NotFoundException('Lead não encontrado.');
    }

    const parsed = updateLeadStepSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Dados inválidos.',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    await this.leadsService.updateStep(id, parsed.data);

    return { ok: true };
  }

  private extractIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0]!.trim();
    }
    return req.ip ?? '0.0.0.0';
  }
}
