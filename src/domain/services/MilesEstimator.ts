import type { CalculatorConfigProvider } from '@/domain/config/CalculatorConfigProvider'
import type { PointsEstimate, ScenarioEstimate } from '@/domain/model/PointsEstimate'
import type { SpendBuckets, SpendProfile } from '@/domain/model/SpendProfile'
import { BonusPurchasesPointsRule } from '@/domain/rules/BonusPurchasesPointsRule'
import { CreditCardTieredPointsRule } from '@/domain/rules/CreditCardTieredPointsRule'
import { PartnerSpendPointsRule } from '@/domain/rules/PartnerSpendPointsRule'
import type { PointsPostProcessor, PointsRule } from '@/domain/rules/PointsRule'
import { TransferBonusRule } from '@/domain/rules/TransferBonusRule'

/**
 * Orquestra as regras nos dois cenarios e devolve a faixa.
 *
 * O motor nao conhece nenhuma regra concreta: recebe a lista por injecao. E isso
 * que permite testar uma regra isolada, trocar a ordem sem efeito colateral e
 * acrescentar fonte de pontos nova sem reabrir esta classe.
 */
export class MilesEstimator {
  private readonly rules: readonly PointsRule[]
  private readonly transferBonus: PointsPostProcessor
  private readonly configProvider: CalculatorConfigProvider

  constructor(options: {
    configProvider: CalculatorConfigProvider
    rules?: readonly PointsRule[]
    transferBonus?: PointsPostProcessor
  }) {
    this.configProvider = options.configProvider
    this.rules = options.rules ?? defaultPointsRules()
    this.transferBonus = options.transferBonus ?? new TransferBonusRule()
  }

  estimate(profile: SpendProfile): PointsEstimate {
    return {
      // Cenario conservador: piso dos intervalos, sem bonus de transferencia.
      min: this.scenario(profile.floor, false),
      // Cenario otimista: teto dos intervalos, com os 25%.
      max: this.scenario(profile.ceiling, true),
    }
  }

  private scenario(buckets: SpendBuckets, applyTransferBonus: boolean): ScenarioEstimate {
    const config = this.configProvider.getConfig()

    const contributions = this.rules.map((rule) => ({
      ruleId: rule.id,
      label: rule.label,
      annualPoints: rule.annualPoints({ buckets, config }),
    }))

    // A soma usa as contribuicoes ja arredondadas, então o detalhamento exibido
    // fecha com o total. Numero grande que nao bate com a lista abaixo dele
    // destroi a confianca no resultado inteiro.
    const basePoints = contributions.reduce((total, item) => total + item.annualPoints, 0)

    const transferBonusPoints = applyTransferBonus
      ? this.transferBonus.bonusPoints(basePoints, config)
      : 0

    return {
      basePoints,
      transferBonusPoints,
      annualPoints: basePoints + transferBonusPoints,
      contributions,
    }
  }
}

/** Composicao padrao das regras, na ordem em que aparecem no detalhamento. */
export function defaultPointsRules(): PointsRule[] {
  return [
    new CreditCardTieredPointsRule(),
    new PartnerSpendPointsRule(),
    new BonusPurchasesPointsRule(),
  ]
}
