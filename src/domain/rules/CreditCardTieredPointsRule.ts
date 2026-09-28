import type { CalculatorConfig, CardTier } from '@/domain/config/calculatorConfig'
import {
  MONTHS_PER_YEAR,
  type PointsRule,
  type PointsRuleContext,
} from '@/domain/rules/PointsRule'

/**
 * Pontos do cartao de credito, com faixas **progressivas**.
 *
 * A progressividade e o ponto sensivel: cada parcela do gasto pontua na sua
 * propria faixa. Quem gasta R$ 60 mil nao ganha 3 pts/USD sobre os 60 mil, ganha
 * 2 sobre os primeiros 25 mil, 2,5 sobre a parcela ate 50 mil e 3 sobre o resto.
 *
 * As faixas sao definidas em reais, mas a pontuacao e por dolar. A ordem correta
 * e fatiar em reais primeiro e converter cada fatia depois — inverter os passos
 * muda o resultado.
 *
 * Uber e iFood entram aqui somando ao volume do cartao pessoal, e ainda recebem
 * o multiplicador de parceiro na `PartnerSpendPointsRule`. Nao e contagem dupla
 * por descuido: e o desenho, porque o gasto passa pela fatura **e** pela
 * parceria.
 */
export class CreditCardTieredPointsRule implements PointsRule {
  readonly id = 'credit-card-tiered'
  readonly label = 'Cartão de crédito'

  annualPoints({ buckets, config }: PointsRuleContext): number {
    const partnerVolume = buckets.uberMonthly + buckets.ifoodMonthly

    const monthlyPoints =
      config.tierScope === 'combined'
        ? tieredPoints(
            buckets.cardPfMonthly + buckets.cardPjMonthly + partnerVolume,
            config,
          )
        : // PF e PJ sao faturas separadas, então escalonam separado. Somar as
          // duas antes de escalonar empurraria o total para faixas melhores e
          // infla o resultado.
          tieredPoints(buckets.cardPfMonthly + partnerVolume, config) +
          tieredPoints(buckets.cardPjMonthly, config)

    return Math.round(monthlyPoints * MONTHS_PER_YEAR)
  }
}

/** Pontos de um mes para um volume em R$, fatiando pelas faixas. */
export function tieredPoints(monthlyVolumeBrl: number, config: CalculatorConfig): number {
  if (monthlyVolumeBrl <= 0) return 0

  let remaining = monthlyVolumeBrl
  let previousCeiling = 0
  let points = 0

  for (const tier of orderedTiers(config.cardTiers)) {
    if (remaining <= 0) break

    const tierWidth = tier.upTo - previousCeiling
    const sliceBrl = Math.min(remaining, tierWidth)

    points += (sliceBrl / config.usdRate) * tier.pointsPerUsd

    remaining -= sliceBrl
    previousCeiling = tier.upTo
  }

  return points
}

/**
 * As faixas precisam estar em ordem crescente para o fatiamento fazer sentido.
 * Ordenar aqui, em vez de confiar na config, torna a regra imune a uma lista
 * escrita fora de ordem.
 */
function orderedTiers(tiers: CardTier[]): CardTier[] {
  return [...tiers].sort((a, b) => a.upTo - b.upTo)
}
