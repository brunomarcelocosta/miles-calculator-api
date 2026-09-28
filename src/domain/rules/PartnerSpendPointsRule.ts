import {
  MONTHS_PER_YEAR,
  type PointsRule,
  type PointsRuleContext,
} from '@/domain/rules/PointsRule'

/**
 * Multiplicador de parceiro sobre transporte por aplicativo e delivery.
 *
 * Sao os pontos que vem da parceria (Livelo/Esfera com Uber e iFood), acima do
 * que a fatura do cartao ja rendeu. Cada parceiro tem seu proprio multiplicador
 * na config, porque as campanhas mudam em ritmos diferentes.
 */
export class PartnerSpendPointsRule implements PointsRule {
  readonly id = 'partner-spend'
  readonly label = 'Parcerias de transporte e delivery'

  annualPoints({ buckets, config }: PointsRuleContext): number {
    const monthlyPoints =
      buckets.uberMonthly * config.partnerPointsPerBrl.uber +
      buckets.ifoodMonthly * config.partnerPointsPerBrl.ifood

    return Math.round(monthlyPoints * MONTHS_PER_YEAR)
  }
}
