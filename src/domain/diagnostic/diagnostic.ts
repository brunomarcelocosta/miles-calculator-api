import { z } from "zod";
import catalog from "./catalog.json";
export { catalog };
export type Answers = Record<string, unknown>;
const question = (id: string) => catalog.questions.find((q) => q.id === id)!;
const choice = (id: string, key = "options") =>
  z
    .string()
    .refine(
      (v) =>
        (
          (question(id) as unknown as Record<string, { id: string }[]>)[key] ??
          []
        ).some((o) => o.id === v),
      "Resposta inválida.",
    );
const optionalChoice = (id: string, key: string) =>
  choice(id, key).nullable().optional();
export const answerSchemas: Record<string, z.ZodType> = Object.fromEntries(
  catalog.questions
    .filter((q) => q.kind === "single")
    .map((q) => [q.id, choice(q.id)]),
);
answerSchemas.mainCard = z
  .object({
    concentration: choice("mainCard"),
    issuer: optionalChoice("mainCard", "banks"),
  })
  .strict()
  .refine((v) => v.concentration !== "none" || !v.issuer);
answerSchemas.pointsProfile = z
  .object({
    programs: z
      .array(choice("pointsProfile"))
      .max(8)
      .refine((v) => new Set(v).size === v.length)
      .refine((v) => !v.includes("Não sei o programa") || v.length === 1),
    amount: optionalChoice("pointsProfile", "amounts"),
  })
  .strict();
answerSchemas.tripDetails = z
  .object({
    destination: optionalChoice("tripDetails", "destinations"),
    other: z.string().trim().max(120).nullable().optional(),
    when: optionalChoice("tripDetails", "timings"),
    travelers: optionalChoice("tripDetails", "travelers"),
    cabin: optionalChoice("tripDetails", "cabins"),
  })
  .strict()
  .refine((v) => !v.other || v.destination === "Outro");
export function visibleQuestions(a: Answers) {
  return catalog.questions.filter(
    (q) =>
      (q.id !== "pointsProfile" && q.id !== "tripDetails") ||
      (q.id === "pointsProfile" &&
        ["unused", "sometimes", "frequent"].includes(
          String(a.pointsRelationship),
        ) &&
        ["yes", "maybe"].includes(String(a.hasPoints))) ||
      (q.id === "tripDetails" && a.tripInMind === "yes"),
  );
}
export function cleanAnswers(input: Answers): Answers {
  const a = { ...input };
  if (!visibleQuestions(a).some((q) => q.id === "pointsProfile"))
    delete a.pointsProfile;
  if (a.tripInMind !== "yes") delete a.tripDetails;
  return a;
}
export function answerLabel(
  id: string,
  value: unknown,
  key = "options",
): string {
  const options = (
    question(id) as unknown as Record<string, { id: string; label: string }[]>
  )[key];
  return options?.find((o) => o.id === value)?.label ?? "Não informado";
}
export function diagnosticResult(a: Answers) {
  const knowledgeable = ["sometimes", "frequent"].includes(
    String(a.pointsRelationship),
  );
  const segment = knowledgeable
    ? "optimize"
    : a.pointsRelationship === "unused" &&
        ["yes", "maybe"].includes(String(a.hasPoints))
      ? "activate"
      : "educate";
  const priority =
    a.monthlySpend === "above_30k" || a.monthlySpend === "20_30k"
      ? "high"
      : a.monthlySpend === "10_20k" || a.monthlySpend === "5_10k"
        ? "medium"
        : "initial";
  const trip = (a.tripDetails ?? {}) as Record<string, unknown>;
  const conclusion =
    segment === "optimize"
      ? "Você já usa pontos para viajar. Seu próximo passo é alinhar o acúmulo e os resgates à viagem que quer fazer, comparando programas, datas e disponibilidade antes de transferir pontos."
      : segment === "activate"
        ? "Você já tem ou acredita ter pontos, mas usa pouco. Seu próximo passo é identificar os saldos e as validades em cada programa, para avaliar opções de uso antes de acumular mais."
        : "Seu primeiro passo é entender onde seus gastos já podem acumular pontos. Verifique as condições do seu cartão e os programas disponíveis antes de mudar seus hábitos de compra.";
  const indicators = [
    {
      label: "Gastos no cartão",
      value: answerLabel("monthlySpend", a.monthlySpend),
      level:
        priority === "high"
          ? "Maior volume de gastos"
          : priority === "medium"
            ? "Oportunidade de organizar o acúmulo"
            : "Começar com os hábitos atuais",
    },
    {
      label: "Experiência com milhas",
      value: answerLabel("pointsRelationship", a.pointsRelationship),
      level:
        segment === "optimize"
          ? "Otimizar a estratégia"
          : segment === "activate"
            ? "Avaliar os pontos disponíveis"
            : "Conhecer os primeiros passos",
    },
    {
      label: "Próxima viagem",
      value:
        a.tripInMind === "yes"
          ? answerLabel("tripDetails", trip.destination, "destinations")
          : "Ainda sem viagem definida",
      level:
        a.tripInMind === "yes"
          ? "Planejar conforme datas e disponibilidade"
          : "Definir um objetivo de viagem",
    },
  ];
  const summary = [
    answerLabel("travelFrequency", a.travelFrequency),
    a.monthlySpend
      ? answerLabel("monthlySpend", a.monthlySpend) + " / mês no cartão"
      : "Não informado",
    answerLabel("pointsRelationship", a.pointsRelationship),
    ...(a.tripInMind === "yes"
      ? [
          trip.destination === "Outro"
            ? String(trip.other || "Outro destino")
            : answerLabel("tripDetails", trip.destination, "destinations"),
          answerLabel("tripDetails", trip.when, "timings"),
          answerLabel("tripDetails", trip.travelers, "travelers"),
          answerLabel("tripDetails", trip.cabin, "cabins"),
        ]
      : ["Sem viagem definida"]),
  ]
    .filter((v) => v !== "Não informado")
    .join(" · ");
  return {
    version: 2 as const,
    segment,
    priority,
    conclusion,
    indicators,
    summary,
  };
}
