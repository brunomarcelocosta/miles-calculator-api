import type { CalculatorConfig } from '@/domain/config/calculatorConfig'
import type { PointsPostProcessor } from '@/domain/rules/PointsRule'

/**
 * Bonus de transferencia para programa de companhia aerea.
 *
 * Incide sobre o total acumulado em Livelo/Esfera, e nao sobre uma parcela —
 * decisao tomada no planejamento, assumindo que o acumulo passa pelos programas
 * antes de virar milha.
 *
 * Aplicado **so no cenario otimista**: e ele que separa o piso do teto da faixa.
 * Promocao de transferencia bonificada nao acontece todo mes, então contar com
 * ela no cenario conservador seria vender otimismo como garantia.
 */
export class TransferBonusRule implements PointsPostProcessor {
  readonly id = 'transfer-bonus'
  readonly label = 'Bônus de transferência'

  bonusPoints(basePoints: number, config: CalculatorConfig): number {
    if (basePoints <= 0) return 0

    return Math.round(basePoints * config.transferBonus)
  }
}
