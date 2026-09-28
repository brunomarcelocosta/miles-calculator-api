
import { LocalCalculatorConfigProvider } from '@/domain/config/CalculatorConfigProvider'
import type { QuizAnswers } from '@/domain/model/QuizAnswers'
import { emptySpendBuckets, type SpendProfile } from '@/domain/model/SpendProfile'
import type { PointsRule } from '@/domain/rules/PointsRule'
import { MilesEstimator, defaultPointsRules } from '@/domain/services/MilesEstimator'
import { resolveSpendProfile } from '@/domain/services/SpendProfileResolver'

const provider = new LocalCalculatorConfigProvider()

function profile(overrides: Partial<SpendProfile> = {}): SpendProfile {
  return {
    floor: emptySpendBuckets(),
    ceiling: emptySpendBuckets(),
    travelStyle: 'beach',
    ...overrides,
  }
}

/** Regra falsa de valor fixo, para testar a orquestracao sem aritmetica real. */
function fixedRule(id: string, annualPoints: number): PointsRule {
  return {
    id,
    label: `Regra ${id}`,
    annualPoints: () => annualPoints,
  }
}

describe('MilesEstimator', () => {
  it('roda cada regra nos dois cenarios', () => {
    const estimator = new MilesEstimator({
      configProvider: provider,
      rules: [fixedRule('a', 100), fixedRule('b', 50)],
    })

    const estimate = estimator.estimate(profile())

    expect(estimate.min.basePoints).toBe(150)
    expect(estimate.max.basePoints).toBe(150)
  })

  it('nao aplica o bonus de transferencia no cenario minimo', () => {
    const estimator = new MilesEstimator({
      configProvider: provider,
      rules: [fixedRule('a', 400_000)],
    })

    const estimate = estimator.estimate(profile())

    expect(estimate.min.transferBonusPoints).toBe(0)
    expect(estimate.min.annualPoints).toBe(400_000)
  })

  it('aplica o bonus de transferencia so no cenario maximo', () => {
    const estimator = new MilesEstimator({
      configProvider: provider,
      rules: [fixedRule('a', 400_000)],
    })

    const estimate = estimator.estimate(profile())

    expect(estimate.max.transferBonusPoints).toBe(100_000)
    expect(estimate.max.annualPoints).toBe(500_000)
  })

  it('mantem o total igual a soma do detalhamento exibido', () => {
    const estimator = new MilesEstimator({
      configProvider: provider,
      rules: defaultPointsRules(),
    })

    const estimate = estimator.estimate(
      profile({
        floor: { ...emptySpendBuckets(), cardPfMonthly: 26_800, retailAnnual: 10_000 },
        ceiling: { ...emptySpendBuckets(), cardPfMonthly: 41_400, retailAnnual: 20_000 },
      }),
    )

    for (const scenario of [estimate.min, estimate.max]) {
      const sum = scenario.contributions.reduce((total, item) => total + item.annualPoints, 0)

      expect(sum).toBe(scenario.basePoints)
      expect(scenario.annualPoints).toBe(scenario.basePoints + scenario.transferBonusPoints)
    }
  })

  it('nao inclui o bonus de transferencia na lista de contribuicoes', () => {
    const estimator = new MilesEstimator({ configProvider: provider })

    const ids = estimator.estimate(profile()).max.contributions.map((item) => item.ruleId)

    expect(ids).not.toContain('transfer-bonus')
  })

  it('expoe as tres regras padrao, na ordem do detalhamento', () => {
    const estimator = new MilesEstimator({ configProvider: provider })

    expect(estimator.estimate(profile()).min.contributions.map((item) => item.ruleId)).toEqual([
      'credit-card-tiered',
      'partner-spend',
      'bonus-purchases',
    ])
  })

  it('aceita regra nova sem alteracao no motor', () => {
    const estimator = new MilesEstimator({
      configProvider: provider,
      rules: [...defaultPointsRules(), fixedRule('amex', 12_000)],
    })

    const contributions = estimator.estimate(profile()).min.contributions

    expect(contributions).toHaveLength(4)
    expect(contributions.at(-1)).toEqual({
      ruleId: 'amex',
      label: 'Regra amex',
      annualPoints: 12_000,
    })
  })

  it('aceita pos-processador substituto', () => {
    const estimator = new MilesEstimator({
      configProvider: provider,
      rules: [fixedRule('a', 1_000)],
      transferBonus: { id: 'none', label: 'Sem bônus', bonusPoints: () => 0 },
    })

    expect(estimator.estimate(profile()).max.annualPoints).toBe(1_000)
  })

  it('devolve faixa zerada quando nao ha gasto', () => {
    const estimator = new MilesEstimator({ configProvider: provider })

    const estimate = estimator.estimate(profile())

    expect(estimate.min.annualPoints).toBe(0)
    expect(estimate.max.annualPoints).toBe(0)
  })

  describe('integrado com o resolvedor de respostas', () => {
    const highSpender: QuizAnswers = {
      cardPf: 'pf_above_26k',
      cardPj: 'pj_above_20k',
      ifood: 'ifood_above_500',
      retailAnnual: 'retail_above_10k',
      travelAnnual: 'travel_above_10k',
      travelStyle: 'style_beach',
      knowledgeLevel: 'knowledge_basic',
      freeTripsPerYear: 'free_zero',
      managerInterest: 'manager_yes',
    }

    const entryLevel: QuizAnswers = {
      cardPf: 'pf_upto_10k',
      cardPj: 'pj_none',
      ifood: 'ifood_zero',
      retailAnnual: 'retail_upto_2k',
      travelAnnual: 'travel_upto_2k',
      travelStyle: 'style_city',
      knowledgeLevel: 'knowledge_none',
      freeTripsPerYear: 'free_zero',
      managerInterest: 'manager_maybe',
    }

    const estimator = new MilesEstimator({ configProvider: provider })

    it('produz uma faixa crescente e nao degenerada para o perfil alto', () => {
      const estimate = estimator.estimate(resolveSpendProfile(highSpender, provider))

      expect(estimate.min.annualPoints).toBeGreaterThan(0)
      expect(estimate.max.annualPoints).toBeGreaterThan(estimate.min.annualPoints)
    })

    it('calcula o perfil alto com os numeros esperados', () => {
      const estimate = estimator.estimate(resolveSpendProfile(highSpender, provider))

      // A pergunta de Uber saiu do quiz; só o iFood alimenta parceiros.
      // Piso: PF 26.000; PJ 20.000; iFood 500/mês.
      //   cartao ..... 208.333/ano
      //   parceiros ..  30.000/ano
      //   bonificadas . 100.000/ano
      expect(estimate.min.contributions.map((item) => item.annualPoints)).toEqual([
        208_333, 30_000, 100_000,
      ])
      expect(estimate.min.annualPoints).toBe(338_333)
      expect(estimate.min.transferBonusPoints).toBe(0)

      // Teto: PF 40.000; PJ 35.000; iFood 800/mês.
      expect(estimate.max.contributions.map((item) => item.annualPoints)).toEqual([
        365_556, 48_000, 200_000,
      ])
      expect(estimate.max.basePoints).toBe(613_556)
      expect(estimate.max.transferBonusPoints).toBe(153_389)
      expect(estimate.max.annualPoints).toBe(766_945)
    })

    it('mantem a faixa larga o bastante para ser informativa', () => {
      const estimate = estimator.estimate(resolveSpendProfile(highSpender, provider))
      const ratio = estimate.max.annualPoints / estimate.min.annualPoints

      // Piso/teto de intervalo produz faixa ampla, ao contrario de um +-25% fixo
      // que ficaria estreito demais para causar impacto.
      expect(ratio).toBeGreaterThan(1.5)
      expect(ratio).toBeLessThan(4)
    })

    it('nunca devolve minimo zero para quem declarou algum gasto', () => {
      const estimate = estimator.estimate(resolveSpendProfile(entryLevel, provider))

      // O piso das opcoes "ate X" e arbitrado justamente para o resultado nao
      // comecar em zero, que nao informaria nada a quem respondeu.
      expect(estimate.min.annualPoints).toBeGreaterThan(0)
    })

    it('ordena os perfis: quem gasta mais recebe faixa maior', () => {
      const low = estimator.estimate(resolveSpendProfile(entryLevel, provider))
      const high = estimator.estimate(resolveSpendProfile(highSpender, provider))

      expect(high.min.annualPoints).toBeGreaterThan(low.min.annualPoints)
      expect(high.max.annualPoints).toBeGreaterThan(low.max.annualPoints)
    })

    it('nao muda o resultado quando so a resposta de qualificacao muda', () => {
      const a = estimator.estimate(resolveSpendProfile(highSpender, provider))
      const b = estimator.estimate(
        resolveSpendProfile(
          { ...highSpender, managerInterest: 'manager_no', freeTripsPerYear: 'free_three_plus' },
          provider,
        ),
      )

      expect(b.min.annualPoints).toBe(a.min.annualPoints)
      expect(b.max.annualPoints).toBe(a.max.annualPoints)
    })
  })
})
