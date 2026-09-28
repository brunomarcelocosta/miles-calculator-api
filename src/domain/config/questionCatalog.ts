import type {
  QualificationQuestionId,
  QuestionId,
  SpendBucketId,
  TravelStyle,
} from '@/domain/model/QuizAnswers'

/**
 * Intervalo em R$ que uma opcao representa.
 *
 * `null` marca a borda que a pergunta nao define:
 *  - `min: null` em opcoes "ate X"     -> o piso vem de `bucketBounds.entryFloor`
 *  - `max: null` em opcoes "acima de X" -> o teto vem de `bucketBounds.openCap`
 */
export interface AmountRange {
  min: number | null
  max: number | null
}

export interface QuestionOption {
  id: string
  label: string
  /** Só em perguntas monetarias. */
  amount?: AmountRange
  /** Só na pergunta de estilo de viagem. */
  travelStyle?: TravelStyle
}

export type QuestionKind = 'spend' | 'profile' | 'qualification'

export type SpendPeriod = 'monthly' | 'annual'

interface BaseQuestion {
  id: QuestionId
  kind: QuestionKind
  title: string
  helper?: string
  options: QuestionOption[]
}

export interface SpendQuestion extends BaseQuestion {
  kind: 'spend'
  id: SpendBucketId
  period: SpendPeriod
}

export interface ProfileQuestion extends BaseQuestion {
  kind: 'profile'
  id: 'travelStyle'
}

export interface QualificationQuestion extends BaseQuestion {
  kind: 'qualification'
  id: QualificationQuestionId
}

export type Question = SpendQuestion | ProfileQuestion | QualificationQuestion

/**
 * As perguntas do funil, na ordem das telas.
 *
 * A ordem nao e cosmetica: as monetarias vem primeiro, enquanto a pessoa ainda
 * esta fresca, e as de qualificacao ficam no fim, quando o compromisso
 * acumulado ja sustenta perguntas que nao mudam o resultado dela.
 */
export const QUESTIONS: readonly Question[] = [
  {
    id: 'cardPf',
    kind: 'spend',
    period: 'monthly',
    title: 'Quanto você gasta por mês no cartão de crédito pessoal?',
    helper: 'Some todas as faturas pessoais do mês.',
    options: [
      { id: 'pf_upto_10k', label: 'Até R$ 10 mil', amount: { min: null, max: 10_000 } },
      { id: 'pf_11_15k', label: 'R$ 11 mil a R$ 15 mil', amount: { min: 11_000, max: 15_000 } },
      { id: 'pf_16_25k', label: 'R$ 16 mil a R$ 25 mil', amount: { min: 16_000, max: 25_000 } },
      { id: 'pf_above_26k', label: 'Acima de R$ 26 mil', amount: { min: 26_000, max: null } },
    ],
  },
  {
    id: 'cardPj',
    kind: 'spend',
    period: 'monthly',
    title: 'E no cartão da sua empresa?',
    helper: 'Gasto mensal no cartão PJ, se você usa um.',
    options: [
      { id: 'pj_none', label: 'Não uso cartão PJ', amount: { min: 0, max: 0 } },
      { id: 'pj_upto_10k', label: 'Até R$ 10 mil', amount: { min: null, max: 10_000 } },
      { id: 'pj_11_15k', label: 'R$ 11 mil a R$ 15 mil', amount: { min: 11_000, max: 15_000 } },
      { id: 'pj_above_20k', label: 'Acima de R$ 20 mil', amount: { min: 20_000, max: null } },
    ],
  },
  {
    id: 'ifood',
    kind: 'spend',
    period: 'monthly',
    title: 'E em delivery de comida?',
    helper: 'iFood, Rappi e similares.',
    options: [
      { id: 'ifood_zero', label: 'Não uso', amount: { min: 0, max: 0 } },
      { id: 'ifood_50_200', label: 'R$ 50 a R$ 200', amount: { min: 50, max: 200 } },
      { id: 'ifood_201_300', label: 'R$ 201 a R$ 300', amount: { min: 201, max: 300 } },
      { id: 'ifood_301_500', label: 'R$ 301 a R$ 500', amount: { min: 301, max: 500 } },
      { id: 'ifood_above_500', label: 'Acima de R$ 500', amount: { min: 500, max: null } },
    ],
  },
  {
    id: 'retailAnnual',
    kind: 'spend',
    period: 'annual',
    title: 'No ano, quanto você gasta com roupas, eletrônicos e cosméticos?',
    helper: 'São as categorias que mais recebem promoção de pontos.',
    options: [
      { id: 'retail_upto_2k', label: 'Até R$ 2 mil', amount: { min: null, max: 2_000 } },
      {
        id: 'retail_2_5k',
        label: 'R$ 2,5 mil a R$ 5 mil',
        amount: { min: 2_500, max: 5_000 },
      },
      { id: 'retail_5_10k', label: 'R$ 5 mil a R$ 10 mil', amount: { min: 5_000, max: 10_000 } },
      { id: 'retail_above_10k', label: 'Acima de R$ 10 mil', amount: { min: 10_000, max: null } },
    ],
  },
  {
    id: 'travelAnnual',
    kind: 'spend',
    period: 'annual',
    title: 'E no ano, quanto vai em passagem e hospedagem?',
    helper: 'Considere o que você paga hoje, sem usar pontos.',
    options: [
      { id: 'travel_upto_2k', label: 'Até R$ 2 mil', amount: { min: null, max: 2_000 } },
      {
        id: 'travel_2_5k',
        label: 'R$ 2,5 mil a R$ 5 mil',
        amount: { min: 2_500, max: 5_000 },
      },
      { id: 'travel_5_10k', label: 'R$ 5 mil a R$ 10 mil', amount: { min: 5_000, max: 10_000 } },
      { id: 'travel_above_10k', label: 'Acima de R$ 10 mil', amount: { min: 10_000, max: null } },
    ],
  },
  {
    id: 'travelStyle',
    kind: 'profile',
    title: 'Que tipo de viagem combina mais com você?',
    options: [
      { id: 'style_beach', label: 'Calor e praia', travelStyle: 'beach' },
      { id: 'style_city', label: 'Cidade e cultura', travelStyle: 'city' },
      { id: 'style_snow', label: 'Frio e neve', travelStyle: 'snow' },
    ],
  },
  {
    id: 'knowledgeLevel',
    kind: 'qualification',
    title: 'Como você se descreve no mundo das Milhas?',
    options: [
      { id: 'knowledge_none', label: 'Nunca prestei atenção nisso' },
      { id: 'knowledge_basic', label: 'Acumulo, mas não sei usar bem' },
      { id: 'knowledge_intermediate', label: 'Já resgatei algumas passagens' },
      { id: 'knowledge_advanced', label: 'Uso pontos com estratégia' },
    ],
  },
  {
    id: 'freeTripsPerYear',
    kind: 'qualification',
    title: 'Quantas viagens você faz de graça hoje, por ano?',
    options: [
      { id: 'free_zero', label: 'Nenhuma' },
      { id: 'free_one', label: 'Uma' },
      { id: 'free_two', label: 'Duas' },
      { id: 'free_three_plus', label: 'Três ou mais' },
    ],
  },
  {
    id: 'managerInterest',
    kind: 'qualification',
    title: 'Faria sentido ter alguém cuidando dos seus pontos?',
    options: [
      { id: 'manager_yes', label: 'Sim, quero saber como' },
      { id: 'manager_maybe', label: 'Talvez, depende do resultado' },
      { id: 'manager_no', label: 'Não, prefiro cuidar sozinho' },
    ],
  },
]

export const SPEND_QUESTIONS: readonly SpendQuestion[] = QUESTIONS.filter(
  (question): question is SpendQuestion => question.kind === 'spend',
)

export function getQuestion(id: QuestionId): Question {
  const question = QUESTIONS.find((candidate) => candidate.id === id)

  if (!question) {
    throw new Error(`Pergunta desconhecida no catalogo: ${id}`)
  }

  return question
}

export function findOption(question: Question, optionId: string): QuestionOption | undefined {
  return question.options.find((option) => option.id === optionId)
}
