import { z } from 'zod';

/**
 * POST /api/leads — cria o lead no momento do preenchimento do formulário.
 * Apenas dados de contato + tracking. Respostas vêm depois via PATCH.
 */

const LIMITS = {
  fullName: 160,
  email: 180,
  phone: 20,
  instagram: 60,
} as const;

function looksLikeEmail(value: string): boolean {
  return z.email().safeParse(value).success;
}

function hasGivenAndFamilyName(value: string): boolean {
  return (
    value
      .trim()
      .split(/\s+/)
      .filter((p) => p.length >= 2).length >= 2
  );
}

export const createLeadSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.fullName)
    .refine(hasGivenAndFamilyName),
  email: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.email)
    .transform((v) => v.toLowerCase())
    .pipe(z.string().refine(looksLikeEmail)),
  phone: z.string().regex(/^\d{10,11}$/),
  instagram: z.string().trim().max(LIMITS.instagram).nullable().optional(),
  consentAt: z.iso.datetime(),

  // Tracking
  utmSource: z.string().max(120).nullable().optional(),
  utmMedium: z.string().max(120).nullable().optional(),
  utmCampaign: z.string().max(180).nullable().optional(),
  utmContent: z.string().max(180).nullable().optional(),
  utmTerm: z.string().max(180).nullable().optional(),
  fbclid: z.string().max(255).nullable().optional(),
  referrer: z.string().nullable().optional(),

  // Honeypot
  honeypot: z.string().max(0).optional().default(''),
});

export type CreateLeadDto = z.infer<typeof createLeadSchema>;
