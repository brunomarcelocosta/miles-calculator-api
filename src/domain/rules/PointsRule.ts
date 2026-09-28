import type { CalculatorConfig } from '@/domain/config/calculatorConfig'
import type { SpendBuckets } from '@/domain/model/SpendProfile'

/** Tudo que uma regra precisa para pontuar um cenario. */
export interface PointsRuleContext {
  buckets: SpendBuckets
  config: CalculatorConfig
}

/**
 * Uma fonte de pontos.
 *
 * O `MilesEstimator` recebe uma lista dessas e nao sabe o que cada uma faz.
 * Adicionar Amex, cashback ou clube de assinatura e criar uma classe e
 * registrar — sem tocar no motor.
 */
export interface PointsRule {
  readonly id: string
  readonly label: string
  /** Pontos por ano gerados no cenario recebido. Sempre inteiro. */
  annualPoints(context: PointsRuleContext): number
}

/**
 * Ajuste aplicado sobre o total, depois de todas as regras.
 *
 * O bonus de transferencia nao e uma fonte de pontos: ele multiplica o que as
 * fontes ja produziram. Separar os dois conceitos evita que ele entre por
 * engano na soma do detalhamento.
 */
export interface PointsPostProcessor {
  readonly id: string
  readonly label: string
  bonusPoints(basePoints: number, config: CalculatorConfig): number
}

export const MONTHS_PER_YEAR = 12
