import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@/prisma/prisma.service";
import type { CreateLeadDto } from "./dto/create-lead.dto";
import type { UpdateLeadStepDto } from "./dto/update-lead-step.dto";
import { QUESTIONS, findOption } from "@/domain/config/questionCatalog";
import { defaultConfigProvider } from "@/domain/config/CalculatorConfigProvider";
import { resolveSpendProfile } from "@/domain/services/SpendProfileResolver";
import { MilesEstimator } from "@/domain/services/MilesEstimator";
import { DestinationRecommender } from "@/domain/services/DestinationRecommender";
import {
  answerSchemas,
  cleanAnswers,
  diagnosticResult,
  visibleQuestions,
  type Answers,
} from "@/domain/diagnostic/diagnostic";
import { BadRequestException } from "@nestjs/common";
import type { QuizAnswers } from "@/domain/model/QuizAnswers";
import { Prisma } from "@prisma/client";

@Injectable()
export class LeadsService {
  private readonly ipSalt: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.ipSalt = this.config.get<string>("IP_HASH_SALT", "default-salt");
  }

  hashIp(ip: string): string {
    return createHash("sha256").update(`${this.ipSalt}:${ip}`).digest("hex");
  }

  /**
   * Duplicata: mesmo email nos últimos 5 minutos.
   */
  async isDuplicate(
    email: string | null | undefined,
    phone?: string | null,
  ): Promise<boolean> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const count = await this.prisma.lead.count({
      where: {
        OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
        createdAt: { gte: fiveMinutesAgo },
      },
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
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        quizVersion: dto.quizVersion ?? 1,
        preferredChannel: dto.quizVersion === 2 ? dto.preferredChannel : null,
        instagram: dto.instagram ?? null,
        consentAt: new Date(dto.consentAt),
        step: "lead",
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
    if (dto.quizVersion === 2) {
      const existing = await this.findById(leadId);
      if (!existing || existing.quizVersion !== 2)
        throw new BadRequestException("Versão do questionário inválida.");
      const current = this.diagnosticAnswers(existing);
      if (!visibleQuestions(current).some((q) => q.id === dto.step))
        throw new BadRequestException(
          "Pergunta indisponível para este perfil.",
        );
      const parsed = answerSchemas[dto.step]!.parse(dto.answer);
      const answers = cleanAnswers({ ...current, [dto.step]: parsed });
      const result = diagnosticResult(answers);
      const card = (answers.mainCard ?? {}) as Record<string, string>;
      const points = answers.pointsProfile as
        { programs: string[]; amount?: string | null } | undefined;
      const trip = (answers.tripDetails ?? {}) as Record<string, string>;
      return this.prisma.lead.update({
        where: { id: leadId },
        data: {
          step: dto.step,
          completedAt: null,
          estimateMin: null,
          estimateMax: null,
          destinations: Prisma.DbNull,
          travelFrequency: (answers.travelFrequency as string) ?? null,
          purchaseChannel: (answers.purchaseChannel as string) ?? null,
          monthlySpend: (answers.monthlySpend as string) ?? null,
          mainCard: card.concentration ?? null,
          cardIssuer: card.issuer ?? null,
          pointsRelationship: (answers.pointsRelationship as string) ?? null,
          hasPoints: (answers.hasPoints as string) ?? null,
          pointsPrograms: points ? points.programs : Prisma.DbNull,
          pointsAmount: points?.amount ?? null,
          tripInMind: (answers.tripInMind as string) ?? null,
          tripDestination: trip.destination ?? null,
          tripDestinationOther: trip.other ?? null,
          tripDetailsSaved:
            answers.tripInMind === "yes" &&
            (dto.step === "tripDetails" || !!existing.tripDetailsSaved),
          tripWhen: trip.when ?? null,
          tripTravelers: trip.travelers ?? null,
          tripCabin: trip.cabin ?? null,
          segment: answers.pointsRelationship ? result.segment : null,
          priority: answers.monthlySpend ? result.priority : null,
          profileSummary: result.summary,
        },
      });
    }
    return this.prisma.lead.update({
      where: { id: leadId },
      data: {
        step: dto.step,
        [dto.step]: dto.answer as string,
        estimateMin: null,
        estimateMax: null,
        destinations: Prisma.DbNull,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.lead.findUnique({ where: { id } });
  }

  diagnosticAnswers(lead: Record<string, unknown>): Answers {
    const a: Answers = {};
    for (const key of [
      "travelFrequency",
      "purchaseChannel",
      "monthlySpend",
      "pointsRelationship",
      "hasPoints",
      "tripInMind",
    ])
      if (lead[key] != null) a[key] = lead[key];
    if (lead.mainCard != null)
      a.mainCard = { concentration: lead.mainCard, issuer: lead.cardIssuer };
    if (lead.pointsPrograms != null)
      a.pointsProfile = {
        programs: lead.pointsPrograms,
        amount: lead.pointsAmount,
      };
    if (lead.tripInMind === "yes" && lead.tripDetailsSaved)
      a.tripDetails = {
        destination: lead.tripDestination,
        other: lead.tripDestinationOther,
        when: lead.tripWhen,
        travelers: lead.tripTravelers,
        cabin: lead.tripCabin,
      };
    return a;
  }

  async complete(id: string) {
    const lead = await this.findById(id);
    if (!lead) return null;

    if (lead.quizVersion === 2) {
      const answers = cleanAnswers(this.diagnosticAnswers(lead));
      for (const q of visibleQuestions(answers)) {
        if (!answerSchemas[q.id]!.safeParse(answers[q.id]).success)
          throw new BadRequestException(
            `Resposta ausente ou inválida: ${q.id}.`,
          );
      }
      const result = diagnosticResult(answers);
      await this.prisma.lead.update({
        where: { id },
        data: {
          step: "result",
          completedAt: lead.completedAt ?? new Date(),
          profileSummary: result.summary,
          segment: result.segment,
          priority: result.priority,
        },
      });
      return result;
    }
    const answers: QuizAnswers = {};
    for (const question of QUESTIONS) {
      const answer = lead[question.id];
      if (!answer || !findOption(question, answer)) {
        throw new BadRequestException(
          `Resposta ausente ou inválida: ${question.id}.`,
        );
      }
      answers[question.id] = answer;
    }

    const profile = resolveSpendProfile(answers, defaultConfigProvider);
    const estimate = new MilesEstimator({
      configProvider: defaultConfigProvider,
    }).estimate(profile);
    const recommendations = new DestinationRecommender().recommend(
      estimate,
      profile.travelStyle,
    );
    await this.prisma.lead.update({
      where: { id },
      data: {
        step: "result",
        completedAt: new Date(),
        estimateMin: estimate.min.annualPoints,
        estimateMax: estimate.max.annualPoints,
        destinations: recommendations.map((item) => item.destination.id),
      },
    });
    return { estimate, recommendations, travelStyle: profile.travelStyle };
  }
}
