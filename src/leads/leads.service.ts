import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import type { CreateLeadDto } from './dto/create-lead.dto';
import type { UpdateLeadStepDto } from './dto/update-lead-step.dto';

/** Colunas válidas para resposta de quiz */
const ANSWER_COLUMNS = [
  'cardPf',
  'cardPj',
  'uber',
  'ifood',
  'retailAnnual',
  'travelAnnual',
  'travelStyle',
  'knowledgeLevel',
  'freeTripsPerYear',
  'managerInterest',
] as const;

@Injectable()
export class LeadsService {
  private readonly ipSalt: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.ipSalt = this.config.get<string>('IP_HASH_SALT', 'default-salt');
  }

  hashIp(ip: string): string {
    return createHash('sha256')
      .update(`${this.ipSalt}:${ip}`)
      .digest('hex');
  }

  /**
   * Duplicata: mesmo email nos últimos 5 minutos.
   */
  async isDuplicate(email: string): Promise<boolean> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const count = await this.prisma.lead.count({
      where: { email, createdAt: { gte: fiveMinutesAgo } },
    });
    return count > 0;
  }

  /**
   * Cria o lead com dados de contato + tracking. Step inicial = 'lead'.
   */
  async create(dto: CreateLeadDto, ip: string, userAgent: string | undefined) {
    return this.prisma.lead.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        instagram: dto.instagram ?? null,
        consentAt: new Date(dto.consentAt),
        step: 'lead',
        utmSource: dto.utmSource ?? null,
        utmMedium: dto.utmMedium ?? null,
        utmCampaign: dto.utmCampaign ?? null,
        utmContent: dto.utmContent ?? null,
        utmTerm: dto.utmTerm ?? null,
        fbclid: dto.fbclid ?? null,
        referrer: dto.referrer ?? null,
        userAgent: userAgent ?? null,
        ipHash: this.hashIp(ip),
      },
    });
  }

  /**
   * Atualiza o step e grava a resposta na coluna correspondente.
   */
  async updateStep(leadId: string, dto: UpdateLeadStepDto) {
    const data: Record<string, unknown> = { step: dto.step };

    // Se é um step de pergunta, grava a resposta na coluna
    if (dto.answer && ANSWER_COLUMNS.includes(dto.step as any)) {
      data[dto.step] = dto.answer;
    }

    // Se é o step 'result', grava estimativas e destinos
    if (dto.step === 'result') {
      if (dto.estimateMin != null) data.estimateMin = dto.estimateMin;
      if (dto.estimateMax != null) data.estimateMax = dto.estimateMax;
      if (dto.destinations != null) data.destinations = dto.destinations;
    }

    return this.prisma.lead.update({
      where: { id: leadId },
      data,
    });
  }

  async findById(id: string) {
    return this.prisma.lead.findUnique({ where: { id } });
  }
}
