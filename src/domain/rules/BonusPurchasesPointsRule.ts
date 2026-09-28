import type { PointsRule, PointsRuleContext } from '@/domain/rules/PointsRule'

/**
 * Compras bonificadas: varejo e viagens.
 *
 * Sao exatamente as categorias que Livelo e Esfera mais promovem, e por isso o
 * quiz pergunta o gasto anual delas em vez de estimar por percentual de renda —
 * o valor declarado e mais fiel do que uma fracao arbitraria do salario.
 *
 * Os dois baldes ja vem em base anual, então nao ha multiplicacao por 12 aqui.
 */
export class BonusPurchasesPointsRule implements PointsRule {
  readonly id = 'bonus-purchases'
  readonly label = 'Compras bonificadas'

  annualPoints({ buckets, config }: PointsRuleContext): number {
    const annualVolume = buckets.retailAnnual + buckets.travelAnnual

    return Math.round(annualVolume * config.bonusPurchasePointsPerBrl)
  }
}
