import { z } from 'zod';

/**
 * PATCH /api/leads/:id/step — atualiza o step atual e a resposta correspondente.
 *
 * Cada chamada avança o lead para o próximo step e grava o valor da resposta
 * na coluna individual.
 */

const VALID_STEPS = [
  'cardPf',
  'cardPj',
  'ifood',
  'retailAnnual',
  'travelAnnual',
  'travelStyle',
  'knowledgeLevel',
  'freeTripsPerYear',
  'managerInterest',
] as const;

export const updateLeadStepSchema = z.object({
  step: z.enum(VALID_STEPS),
  answer: z.string().min(1).max(40),
});

export type UpdateLeadStepDto = z.infer<typeof updateLeadStepSchema>;
