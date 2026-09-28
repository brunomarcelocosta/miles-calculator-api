import type { SpendBucketId } from '@/domain/model/QuizAnswers'

/** Uma faixa de pontuacao do cartao. `upTo` e o limite superior do gasto mensal. */
export interface CardTier {
  upTo: number
  pointsPerUsd: number
}

/**
 * Limites arbitrados das opcoes sem borda.
 *
 * As perguntas do quiz nao tem limite superior em "acima de X" nem limite
 * inferior em "ate X", então esses dois numeros sao escolha nossa, nao dado do
 * usuario. Ficam juntos aqui de proposito: sao eles que definem a largura da
 * faixa no resultado, e por isso merecem revisao explicita.
 */
export interface BucketBounds {
  /** Piso das opcoes "ate X". */
  entryFloor: number
  /** Teto das opcoes "acima de X". */
  openCap: number
}

export type TierScope = 'per-card' | 'combined'

export interface CalculatorConfig {
  /** Cotacao usada para converter gasto em R$ em dolares de fatura. */
  usdRate: number

  /**
   * Faixas progressivas: cada parcela do gasto pontua na sua propria faixa, e
   * nao o total na aliquota da ultima faixa alcancada.
   */
  cardTiers: CardTier[]

  /**
   * `per-card` escalona PF e PJ separadamente, que e a leitura honesta — sao
   * faturas distintas. `combined` soma os dois antes de escalonar e infla o
   * resultado.
   */
  tierScope: TierScope

  /** Pontos por real gastos em parceiro, **somados** aos pontos do cartao. */
  partnerPointsPerBrl: {
    uber: number
    ifood: number
  }

  /** Pontos por real em compra bonificada (varejo e viagens). */
  bonusPurchasePointsPerBrl: number

  /** Bonus de transferencia para companhia aerea, aplicado so no cenario maximo. */
  transferBonus: number

  bucketBounds: Record<SpendBucketId, BucketBounds>
}

export const DEFAULT_CALCULATOR_CONFIG: CalculatorConfig = {
  usdRate: 5.4,

  cardTiers: [
    { upTo: 25_000, pointsPerUsd: 2 },
    { upTo: 50_000, pointsPerUsd: 2.5 },
    { upTo: Number.POSITIVE_INFINITY, pointsPerUsd: 3 },
  ],

  tierScope: 'per-card',

  partnerPointsPerBrl: {
    uber: 5,
    ifood: 5,
  },

  bonusPurchasePointsPerBrl: 5,

  transferBonus: 0.25,

  bucketBounds: {
    // Quem tem cartao e responde um quiz de milhas dificilmente gasta zero,
    // então o piso de "ate R$ 10 mil" nao e zero: seria uma faixa comecando em
    // nenhum ponto, o que nao informa nada.
    cardPf: { entryFloor: 4_000, openCap: 40_000 },
    cardPj: { entryFloor: 4_000, openCap: 35_000 },
    // iFood tem opcao explicita de "nao uso" e as demais sao intervalos
    // fechados, então o piso de entrada nunca e consultado nesse balde.
    ifood: { entryFloor: 0, openCap: 800 },
    retailAnnual: { entryFloor: 800, openCap: 20_000 },
    travelAnnual: { entryFloor: 800, openCap: 20_000 },
  },
}
