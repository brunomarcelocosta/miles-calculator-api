import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import type { CreateLeadDto } from './dto/create-lead.dto';
import type { UpdateLeadStepDto } from './dto/update-lead-step.dto';
import { QUESTIONS, findOption } from '@/domain/config/questionCatalog';
import { defaultConfigProvider } from '@/domain/config/CalculatorConfigProvider';
import { resolveSpendProfile } from '@/domain/services/SpendProfileResolver';
import { MilesEstimator } from '@/domain/services/MilesEstimator';
import { DestinationRecommender } from '@/domain/services/DestinationRecommender';
import { BadRequestException } from '@nestjs/common';
import type { QuizAnswers } from '@/domain/model/QuizAnswers';
import { Prisma } from '@prisma/client';

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
        ...(dto.submissionId ? { id: dto.submissionId } : {}),
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
    return this.prisma.lead.update({
      where: { id: leadId },
      data: {
        step: dto.step,
        [dto.step]: dto.answer,
        estimateMin: null,
        estimateMax: null,
        destinations: Prisma.DbNull,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.lead.findUnique({ where: { id } });
  }

  async complete(id: string) {
    const lead = await this.findById(id);
    if (!lead) return null;

    const answers: QuizAnswers = {};
    for (const question of QUESTIONS) {
      const answer = lead[question.id];
      if (!answer || !findOption(question, answer)) {
        throw new BadRequestException(`Resposta ausente ou inválida: ${question.id}.`);
      }
      answers[question.id] = answer;
    }

    const profile = resolveSpendProfile(answers, defaultConfigProvider);
    const estimate = new MilesEstimator({ configProvider: defaultConfigProvider }).estimate(profile);
    const recommendations = new DestinationRecommender().recommend(estimate, profile.travelStyle);
    await this.prisma.lead.update({
      where: { id },
      data: {
        step: 'result',
        estimateMin: estimate.min.annualPoints,
        estimateMax: estimate.max.annualPoints,
        destinations: recommendations.map((item) => item.destination.id),
      },
    });
    return { estimate, recommendations, travelStyle: profile.travelStyle };
  }
}
