import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '@/prisma/prisma.service';
import { CalculatorController } from './calculator.controller';
import { LeadsService } from '@/leads/leads.service';
import { LeadsController } from '@/leads/leads.controller';
import type { Request } from 'express';

const answers = {
  cardPf: 'pf_above_26k',
  cardPj: 'pj_above_20k',
  ifood: 'ifood_above_500',
  retailAnnual: 'retail_above_10k',
  travelAnnual: 'travel_above_10k',
  travelStyle: 'style_beach',
  knowledgeLevel: 'knowledge_basic',
  freeTripsPerYear: 'free_zero',
  managerInterest: 'manager_yes',
};

describe('calculadora compartilhada', () => {
  it('publica as nove perguntas com identificadores usados pelos leads', () => {
    const quiz = new CalculatorController().quiz();
    expect(quiz.questions).toHaveLength(9);
    expect(quiz.questions.map((question) => question.id)).toEqual(Object.keys(answers));
  });

  it('calcula no servidor, persiste o resultado e devolve cinco destinos', async () => {
    const lead = {
      findUnique: jest.fn().mockResolvedValue({ id: 'lead', ...answers }),
      update: jest.fn().mockResolvedValue({}),
    };
    const service = new LeadsService(
      { lead } as unknown as PrismaService,
      { get: () => 'test-salt' } as unknown as ConfigService,
    );
    const result = await service.complete('lead');
    expect(result?.estimate.min.annualPoints).toBe(338333);
    expect(result?.estimate.max.annualPoints).toBe(766945);
    expect(result?.estimate.min.transferBonusPoints).toBe(0);
    expect(result?.estimate.max.transferBonusPoints).toBe(
      Math.round(result!.estimate.max.basePoints * 0.25),
    );
    expect(result?.recommendations).toHaveLength(5);
    expect(result?.recommendations.every((item) => item.destination.styles.includes('beach'))).toBe(true);
    expect(lead.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ step: 'result', estimateMin: 338333, estimateMax: 766945 }),
    }));
  });

  it('reenvio da mesma submissão devolve o lead sem criar duplicata', async () => {
    const id = '11a42c92-d065-4f67-98f1-bc7f4d190655';
    const service = {
      findById: jest.fn().mockResolvedValue({ id, email: 'ana@example.com', phone: '12997643952' }),
      create: jest.fn(),
      isDuplicate: jest.fn(),
    };
    const controller = new LeadsController(service as unknown as LeadsService);
    const result = await controller.create({
      submissionId: id, fullName: 'Ana Souza', email: 'ana@example.com',
      phone: '12997643952', consentAt: new Date().toISOString(),
    }, { headers: {}, ip: '127.0.0.1' } as Request);
    expect(result).toEqual({ id });
    expect(service.create).not.toHaveBeenCalled();
    expect(service.isDuplicate).not.toHaveBeenCalled();
  });

  it('refazer permite nova submissão do mesmo contato', async () => {
    const id = '11a42c92-d065-4f67-98f1-bc7f4d190655';
    const service = {
      findById: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id }),
      isDuplicate: jest.fn().mockResolvedValue(true),
    };
    const controller = new LeadsController(service as unknown as LeadsService);
    await expect(controller.create({
      submissionId: id, fullName: 'Ana Souza', email: 'ana@example.com',
      phone: '12997643952', consentAt: new Date().toISOString(),
    }, { headers: {}, ip: '127.0.0.1' } as Request)).resolves.toEqual({ id });
    expect(service.create).toHaveBeenCalledTimes(1);
    expect(service.isDuplicate).not.toHaveBeenCalled();
  });

  it('não completa um lead com resposta ausente', async () => {
    const lead = {
      findUnique: jest.fn().mockResolvedValue({ id: 'lead', ...answers, cardPf: null }),
      update: jest.fn(),
    };
    const service = new LeadsService(
      { lead } as unknown as PrismaService,
      { get: () => 'test-salt' } as unknown as ConfigService,
    );
    await expect(service.complete('lead')).rejects.toBeInstanceOf(BadRequestException);
    expect(lead.update).not.toHaveBeenCalled();
  });
});
