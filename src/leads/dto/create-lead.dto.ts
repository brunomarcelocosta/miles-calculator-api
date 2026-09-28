import { z } from "zod";
import { isValidPhoneNumber } from "libphonenumber-js/max";

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

const legacyCreateLeadSchema = z.object({
  submissionId: z.uuid().optional(),
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
  // Keep national numbers for existing app clients; the site now sends E.164.
  phone: z.union([
    z.string().regex(/^\d{10,11}$/),
    z
      .string()
      .regex(/^\+[1-9]\d{1,14}$/)
      .refine((value) => isValidPhoneNumber(value)),
  ]),
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
  honeypot: z.string().max(0).optional().default(""),
});

const diagnosticCreateLeadSchema = legacyCreateLeadSchema
  .extend({
    quizVersion: z.literal(2),
    preferredChannel: z.enum(["whatsapp", "email"]),
    fullName: z.string().trim().min(2).max(LIMITS.fullName),
    email: z
      .email()
      .trim()
      .toLowerCase()
      .max(LIMITS.email)
      .nullable()
      .optional(),
    phone: z
      .string()
      .regex(/^\+[1-9]\d{1,14}$/)
      .refine(isValidPhoneNumber)
      .nullable()
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.preferredChannel === "whatsapp" && !v.phone)
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: "Informe seu WhatsApp.",
      });
    if (v.preferredChannel === "email" && !v.email)
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Informe seu e-mail.",
      });
  });
// Missing version is the existing v1 contract. Never reinterpret legacy payloads.
export const createLeadSchema = z.union([
  diagnosticCreateLeadSchema,
  legacyCreateLeadSchema.extend({ quizVersion: z.literal(1).optional() }),
]);
export type CreateLeadDto = z.infer<typeof createLeadSchema>;
