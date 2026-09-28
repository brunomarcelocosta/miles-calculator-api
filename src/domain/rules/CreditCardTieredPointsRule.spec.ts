
import { DEFAULT_CALCULATOR_CONFIG } from '@/domain/config/calculatorConfig'
import { emptySpendBuckets, type SpendBuckets } from '@/domain/model/SpendProfile'
import {
  CreditCardTieredPointsRule,
  tieredPoints,
} from '@/domain/rules/CreditCardTieredPointsRule'

const config = DEFAULT_CALCULATOR_CONFIG
const rule = new CreditCardTieredPointsRule()

function buckets(overrides: Partial<SpendBuckets> = {}): SpendBuckets {
  return { ...emptySpendBuckets(), ...overrides }
}

/** Pontos de uma fatia em reais dentro de uma faixa, com a cotacao padrao. */
function slice(brl: number, pointsPerUsd: number): number {
  return (brl / config.usdRate) * pointsPerUsd
}

describe('tieredPoints', () => {
  it('devolve zero para volume zero', () => {
    expect(tieredPoints(0, config)).toBe(0)
  })

  it('devolve zero para volume negativo', () => {
    expect(tieredPoints(-5_000, config)).toBe(0)
  })

  it('pontua a 2 pts/USD abaixo da primeira borda', () => {
    expect(tieredPoints(10_000, config)).toBeCloseTo(slice(10_000, 2), 6)
  })

  it('na borda exata de R$ 25 mil ainda esta toda na primeira faixa', () => {
    expect(tieredPoints(25_000, config)).toBeCloseTo(slice(25_000, 2), 6)
  })

  it('um real acima de R$ 25 mil joga apenas esse real para a segunda faixa', () => {
    const expected = slice(25_000, 2) + slice(1, 2.5)

    expect(tieredPoints(25_001, config)).toBeCloseTo(expected, 6)
  })

  it('na borda exata de R$ 50 mil fecha a segunda faixa sem abrir a terceira', () => {
    const expected = slice(25_000, 2) + slice(25_000, 2.5)

    expect(tieredPoints(50_000, config)).toBeCloseTo(expected, 6)
  })

  it('um real acima de R$ 50 mil joga apenas esse real para a terceira faixa', () => {
    const expected = slice(25_000, 2) + slice(25_000, 2.5) + slice(1, 3)

    expect(tieredPoints(50_001, config)).toBeCloseTo(expected, 6)
  })

  it('reproduz o exemplo de R$ 60 mil do planejamento', () => {
    // R$ 25 mil a 2,0 + R$ 25 mil a 2,5 + R$ 10 mil a 3,0 = 26.389 pts/mes
    expect(tieredPoints(60_000, config)).toBeCloseTo(26_388.89, 1)
  })

  it('e progressivo, nao aliquota unica sobre o total', () => {
    // Aliquota unica daria 60.000/5,40 x 3 = 33.333 pts. O progressivo tem de
    // ficar abaixo disso.
    const flatRate = slice(60_000, 3)

    expect(tieredPoints(60_000, config)).toBeLessThan(flatRate)
  })

  it('cresce de forma monotona com o volume', () => {
    const volumes = [0, 1_000, 24_999, 25_000, 25_001, 49_999, 50_000, 50_001, 120_000]
    const points = volumes.map((volume) => tieredPoints(volume, config))

    for (let i = 1; i < points.length; i += 1) {
      expect(points[i]!).toBeGreaterThanOrEqual(points[i - 1]!)
    }
  })

  it('nao depende da ordem em que as faixas foram escritas na config', () => {
    const shuffled = {
      ...config,
      cardTiers: [...config.cardTiers].reverse(),
    }

    expect(tieredPoints(60_000, shuffled)).toBeCloseTo(tieredPoints(60_000, config), 6)
  })

  it('acompanha a cotacao do dolar', () => {
    const cheaperUsd = { ...config, usdRate: 2.7 }

    // Dolar pela metade dobra a quantidade de dolares faturados.
    expect(tieredPoints(10_000, cheaperUsd)).toBeCloseTo(tieredPoints(10_000, config) * 2, 6)
  })
})

describe('CreditCardTieredPointsRule', () => {
  it('anualiza multiplicando por doze', () => {
    const monthly = tieredPoints(10_000, config)

    expect(rule.annualPoints({ buckets: buckets({ cardPfMonthly: 10_000 }), config })).toBe(
      Math.round(monthly * 12),
    )
  })

  it('soma Uber e iFood ao volume do cartao pessoal', () => {
    const withPartners = rule.annualPoints({
      buckets: buckets({ cardPfMonthly: 10_000, uberMonthly: 300, ifoodMonthly: 500 }),
      config,
    })
    const equivalent = rule.annualPoints({
      buckets: buckets({ cardPfMonthly: 10_800 }),
      config,
    })

    expect(withPartners).toBe(equivalent)
  })

  it('em tierScope per-card, PF e PJ escalonam separado', () => {
    const separate = rule.annualPoints({
      buckets: buckets({ cardPfMonthly: 20_000, cardPjMonthly: 20_000 }),
      config,
    })

    // Separado, os dois ficam inteiros na faixa de 2 pts/USD.
    expect(separate).toBe(Math.round(tieredPoints(20_000, config) * 2 * 12))
  })

  it('em tierScope combined, PF e PJ somam antes de escalonar e rendem mais', () => {
    const combinedConfig = { ...config, tierScope: 'combined' as const }

    const combined = rule.annualPoints({
      buckets: buckets({ cardPfMonthly: 20_000, cardPjMonthly: 20_000 }),
      config: combinedConfig,
    })
    const perCard = rule.annualPoints({
      buckets: buckets({ cardPfMonthly: 20_000, cardPjMonthly: 20_000 }),
      config,
    })

    expect(combined).toBeGreaterThan(perCard)
    expect(combined).toBe(Math.round(tieredPoints(40_000, combinedConfig) * 12))
  })

  it('devolve zero quando nao ha gasto nenhum', () => {
    expect(rule.annualPoints({ buckets: buckets(), config })).toBe(0)
  })

  it('ignora os baldes anuais, que sao de outra regra', () => {
    expect(
      rule.annualPoints({
        buckets: buckets({ retailAnnual: 20_000, travelAnnual: 20_000 }),
        config,
      }),
    ).toBe(0)
  })

  it('devolve inteiro', () => {
    const points = rule.annualPoints({
      buckets: buckets({ cardPfMonthly: 26_800, cardPjMonthly: 20_000 }),
      config,
    })

    expect(Number.isInteger(points)).toBe(true)
  })
})
