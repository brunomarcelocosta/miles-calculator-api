import type { CalculatorConfig } from '@/domain/config/calculatorConfig'
import type { CalculatorConfigProvider } from '@/domain/config/CalculatorConfigProvider'
import {
  findOption,
  getQuestion,
  SPEND_QUESTIONS,
  type AmountRange,
} from '@/domain/config/questionCatalog'
import type { QuizAnswers, SpendBucketId, TravelStyle } from '@/domain/model/QuizAnswers'
import { isTravelStyle } from '@/domain/model/QuizAnswers'
import {
  emptySpendBuckets,
  SPEND_BUCKET_FIELD,
  type SpendProfile,
} from '@/domain/model/SpendProfile'

/** Erro de resposta: falta pergunta, ou o id de opcao nao existe no catalogo. */
export class QuizAnswerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuizAnswerError'
  }
}

/** Intervalo em R$ ja com as bordas abertas resolvidas pela config. */
export interface ResolvedAmountRange {
  floor: number
  ceiling: number
}

/**
 * Fecha as bordas que a pergunta deixa abertas.
 *
 * `min: null` vem de uma opcao "ate X" e `max: null` de uma opcao "acima de X".
 * Nos dois casos o numero que falta e escolha nossa, guardada em
 * `bucketBounds`, e nao algo que o usuario informou.
 */
export function resolveAmountRange(
  amount: AmountRange,
  bucket: SpendBucketId,
  config: CalculatorConfig,
): ResolvedAmountRange {
  const bounds = config.bucketBounds[bucket]

  const floor = amount.min ?? bounds.entryFloor
  const ceiling = amount.max ?? bounds.openCap

  if (ceiling < floor) {
    throw new QuizAnswerError(
      `Intervalo invalido no balde ${bucket}: teto ${ceiling} menor que piso ${floor}.`,
    )
  }

  return { floor, ceiling }
}

/** Resolve o intervalo de um balde a partir do id da opcao respondida. */
export function resolveBucketRange(
  bucket: SpendBucketId,
  optionId: string,
  config: CalculatorConfig,
): ResolvedAmountRange {
  const question = getQuestion(bucket)
  const option = findOption(question, optionId)

  if (!option) {
    throw new QuizAnswerError(
      `Opcao "${optionId}" nao existe na pergunta "${bucket}".`,
    )
  }

  if (!option.amount) {
    throw new QuizAnswerError(
      `Opcao "${optionId}" da pergunta "${bucket}" nao declara intervalo em R$.`,
    )
  }

  return resolveAmountRange(option.amount, bucket, config)
}

function resolveTravelStyle(answers: QuizAnswers): TravelStyle {
  const optionId = answers.travelStyle

  if (!optionId) {
    throw new QuizAnswerError('Pergunta "travelStyle" nao respondida.')
  }

  const option = findOption(getQuestion('travelStyle'), optionId)

  if (!option?.travelStyle || !isTravelStyle(option.travelStyle)) {
    throw new QuizAnswerError(`Opcao "${optionId}" nao mapeia um estilo de viagem valido.`)
  }

  return option.travelStyle
}

/**
 * Converte as respostas do quiz nos dois cenarios de gasto.
 *
 * Sem I/O e sem estado: entra `QuizAnswers`, sai `SpendProfile`. E essa
 * assinatura que permite testar todas as combinacoes de resposta sem montar
 * nenhuma tela.
 */
export function resolveSpendProfile(
  answers: QuizAnswers,
  configProvider: CalculatorConfigProvider,
): SpendProfile {
  const config = configProvider.getConfig()
  const floor = emptySpendBuckets()
  const ceiling = emptySpendBuckets()

  for (const question of SPEND_QUESTIONS) {
    const optionId = answers[question.id]

    if (!optionId) {
      throw new QuizAnswerError(`Pergunta "${question.id}" nao respondida.`)
    }

    const range = resolveBucketRange(question.id, optionId, config)
    const field = SPEND_BUCKET_FIELD[question.id]

    floor[field] = range.floor
    ceiling[field] = range.ceiling
  }

  return {
    floor,
    ceiling,
    travelStyle: resolveTravelStyle(answers),
  }
}
