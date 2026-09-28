
import { DEFAULT_CALCULATOR_CONFIG } from '@/domain/config/calculatorConfig'
import { emptySpendBuckets, type SpendBuckets } from '@/domain/model/SpendProfile'
import { BonusPurchasesPointsRule } from '@/domain/rules/BonusPurchasesPointsRule'
import { PartnerSpendPointsRule } from '@/domain/rules/PartnerSpendPointsRule'
import { TransferBonusRule } from '@/domain/rules/TransferBonusRule'

const config = DEFAULT_CALCULATOR_CONFIG

function buckets(overrides: Partial<SpendBuckets> = {}): SpendBuckets {
  return { ...emptySpendBuckets(), ...overrides }
}

describe('PartnerSpendPointsRule', () => {
  const rule = new PartnerSpendPointsRule()

  it('aplica 5 pts/R$ em Uber e em iFood e anualiza', () => {
    const points = rule.annualPoints({
      buckets: buckets({ uberMonthly: 300, ifoodMonthly: 500 }),
      config,
    })

    // (300 x 5 + 500 x 5) x 12 = 48.000
    expect(points).toBe(48_000)
  })

  it('usa o multiplicador de cada parceiro de forma independente', () => {
    const custom = {
      ...config,
      partnerPointsPerBrl: { uber: 4, ifood: 8 },
    }

    const points = rule.annualPoints({
      buckets: buckets({ uberMonthly: 100, ifoodMonthly: 100 }),
      config: custom,
    })

    // (100 x 4 + 100 x 8) x 12 = 14.400
    expect(points).toBe(14_400)
  })

  it('devolve zero quando a pessoa nao usa nenhum dos dois', () => {
    expect(rule.annualPoints({ buckets: buckets(), config })).toBe(0)
  })

  it('nao pontua gasto de cartao, que e de outra regra', () => {
    expect(
      rule.annualPoints({
        buckets: buckets({ cardPfMonthly: 40_000, cardPjMonthly: 35_000 }),
        config,
      }),
    ).toBe(0)
  })
})

describe('BonusPurchasesPointsRule', () => {
  const rule = new BonusPurchasesPointsRule()

  it('aplica 5 pts/R$ sobre varejo mais viagens, sem multiplicar por doze', () => {
    const points = rule.annualPoints({
      buckets: buckets({ retailAnnual: 10_000, travelAnnual: 10_000 }),
      config,
    })

    // Os baldes ja sao anuais: (10.000 + 10.000) x 5 = 100.000
    expect(points).toBe(100_000)
  })

  it('soma os dois baldes anuais', () => {
    const onlyRetail = rule.annualPoints({ buckets: buckets({ retailAnnual: 20_000 }), config })
    const split = rule.annualPoints({
      buckets: buckets({ retailAnnual: 10_000, travelAnnual: 10_000 }),
      config,
    })

    expect(split).toBe(onlyRetail)
  })

  it('acompanha o multiplicador da config', () => {
    const custom = { ...config, bonusPurchasePointsPerBrl: 3 }

    expect(
      rule.annualPoints({ buckets: buckets({ retailAnnual: 1_000 }), config: custom }),
    ).toBe(3_000)
  })

  it('devolve zero sem compra bonificada', () => {
    expect(rule.annualPoints({ buckets: buckets(), config })).toBe(0)
  })

  it('nao pontua gasto mensal de cartao', () => {
    expect(
      rule.annualPoints({ buckets: buckets({ cardPfMonthly: 40_000 }), config }),
    ).toBe(0)
  })
})

describe('TransferBonusRule', () => {
  const rule = new TransferBonusRule()

  it('devolve 25% do total base', () => {
    expect(rule.bonusPoints(400_000, config)).toBe(100_000)
  })

  it('arredonda para inteiro', () => {
    expect(rule.bonusPoints(1_001, config)).toBe(250)
  })

  it('devolve zero para base zero', () => {
    expect(rule.bonusPoints(0, config)).toBe(0)
  })

  it('devolve zero para base negativa, em vez de subtrair mais', () => {
    expect(rule.bonusPoints(-1_000, config)).toBe(0)
  })

  it('acompanha o percentual da config', () => {
    expect(rule.bonusPoints(100_000, { ...config, transferBonus: 0.8 })).toBe(80_000)
  })

  it('desligar o bonus na config zera a contribuicao', () => {
    expect(rule.bonusPoints(100_000, { ...config, transferBonus: 0 })).toBe(0)
  })
})
