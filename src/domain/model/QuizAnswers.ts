/**
 * Identificadores das perguntas do quiz.
 *
 * As perguntas se dividem em tres naturezas, e a distincao importa porque
 * so a primeira entra na conta:
 *
 *  - `spend`         alimenta um balde de gasto em R$ e vira pontos
 *  - `profile`       define o filtro de destinos (estilo de viagem)
 *  - `qualification` serve para o time comercial ler o lead, nao para calcular
 */

/** Baldes de gasto. O id da pergunta monetaria e o proprio id do balde. */
export const SPEND_BUCKET_IDS = [
  'cardPf',
  'cardPj',
  'ifood',
  'retailAnnual',
  'travelAnnual',
] as const

export type SpendBucketId = (typeof SPEND_BUCKET_IDS)[number]

export const PROFILE_QUESTION_IDS = ['travelStyle'] as const

export type ProfileQuestionId = (typeof PROFILE_QUESTION_IDS)[number]

export const QUALIFICATION_QUESTION_IDS = [
  'knowledgeLevel',
  'freeTripsPerYear',
  'managerInterest',
] as const

export type QualificationQuestionId = (typeof QUALIFICATION_QUESTION_IDS)[number]

export type QuestionId = SpendBucketId | ProfileQuestionId | QualificationQuestionId

/** Estilo de viagem escolhido, usado para filtrar o catalogo de destinos. */
export const TRAVEL_STYLES = ['beach', 'city', 'snow'] as const

export type TravelStyle = (typeof TRAVEL_STYLES)[number]

/**
 * Respostas do quiz em andamento: cada chave guarda o **id da opcao**
 * escolhida, nunca o valor em reais. Guardar o id e o que permite recalcular o
 * historico depois, se as premissas mudarem.
 */
export type QuizAnswers = Partial<Record<QuestionId, string>>

/** Respostas com todas as perguntas preenchidas. */
export type CompletedQuizAnswers = Record<QuestionId, string>

export function isSpendBucketId(value: string): value is SpendBucketId {
  return (SPEND_BUCKET_IDS as readonly string[]).includes(value)
}

export function isTravelStyle(value: string): value is TravelStyle {
  return (TRAVEL_STYLES as readonly string[]).includes(value)
}
