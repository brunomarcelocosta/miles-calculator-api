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
  'uber',
  'ifood',
  'retailAnnual',
  'travelAnnual',
  'travelStyle',
  'knowledgeLevel',
  'freeTripsPerYear',
  'managerInterest',
  'result',
] as const;

export const updateLeadStepSchema = z.object({
  step: z.enum(VALID_STEPS),
  /** O id da opção escolhida nesse step (null apenas no step 'result') */
  answer: z.string().max(40).nullable().optional(),
  /** Preenchido apenas no step 'result' */
  estimateMin: z.number().int().nonnegative().nullable().optional(),
  estimateMax: z.number().int().nonnegative().nullable().optional(),
  destinations: z.array(z.string()).nullable().optional(),
});

export type UpdateLeadStepDto = z.infer<typeof updateLeadStepSchema>;
