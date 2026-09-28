import { catalog, answerSchemas } from "@/domain/diagnostic/diagnostic";
import { z } from "zod";

/**
 * PATCH /api/leads/:id/step — atualiza o step atual e a resposta correspondente.
 *
 * Cada chamada avança o lead para o próximo step e grava o valor da resposta
 * na coluna individual.
 */

const VALID_STEPS = [
  "cardPf",
  "cardPj",
  "ifood",
  "retailAnnual",
  "travelAnnual",
  "travelStyle",
  "knowledgeLevel",
  "freeTripsPerYear",
  "managerInterest",
] as const;

const legacyUpdateLeadStepSchema = z.object({
  step: z.enum(VALID_STEPS),
  answer: z.string().min(1).max(40),
});

export const updateLeadStepSchema = z.union([
  z
    .object({
      quizVersion: z.literal(2),
      step: z.string().refine((s) => catalog.questions.some((q) => q.id === s)),
      answer: z.unknown(),
    })
    .superRefine((v, ctx) => {
      if (!answerSchemas[v.step]?.safeParse(v.answer).success)
        ctx.addIssue({
          code: "custom",
          path: ["answer"],
          message: "Resposta inválida.",
        });
    }),
  legacyUpdateLeadStepSchema.extend({ quizVersion: z.literal(1).optional() }),
]);
export type UpdateLeadStepDto = z.infer<typeof updateLeadStepSchema>;
