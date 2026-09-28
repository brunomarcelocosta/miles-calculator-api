
import { DEFAULT_CALCULATOR_CONFIG } from '@/domain/config/calculatorConfig'
import {
  LocalCalculatorConfigProvider,
  type CalculatorConfigProvider,
} from '@/domain/config/CalculatorConfigProvider'
import { SPEND_QUESTIONS } from '@/domain/config/questionCatalog'
import type { QuizAnswers } from '@/domain/model/QuizAnswers'
import {
  QuizAnswerError,
  resolveBucketRange,
  resolveSpendProfile,
} from '@/domain/services/SpendProfileResolver'

const provider: CalculatorConfigProvider = new LocalCalculatorConfigProvider()
const config = DEFAULT_CALCULATOR_CONFIG

/** Respostas completas de referencia: perfil alto, para checar os tetos. */
function highSpenderAnswers(): QuizAnswers {
  return {
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
}

describe('resolveBucketRange', () => {
  describe('intervalos fechados usam exatamente o que a pergunta diz', () => {
    it.each([
      ['cardPf', 'pf_11_15k', 11_000, 15_000],
      ['cardPf', 'pf_16_25k', 16_000, 25_000],
      ['cardPj', 'pj_11_15k', 11_000, 15_000],
      ['ifood', 'ifood_50_200', 50, 200],
      ['ifood', 'ifood_201_300', 201, 300],
      ['ifood', 'ifood_301_500', 301, 500],
      ['retailAnnual', 'retail_2_5k', 2_500, 5_000],
      ['retailAnnual', 'retail_5_10k', 5_000, 10_000],
      ['travelAnnual', 'travel_2_5k', 2_500, 5_000],
      ['travelAnnual', 'travel_5_10k', 5_000, 10_000],
    ] as const)('%s / %s vira [%i, %i]', (bucket, optionId, floor, ceiling) => {
      expect(resolveBucketRange(bucket, optionId, config)).toEqual({ floor, ceiling })
    })
  })

  describe('opcoes de "nao uso" viram zero nos dois cenarios', () => {
    it.each([
      ['cardPj', 'pj_none'],
      ['ifood', 'ifood_zero'],
    ] as const)('%s / %s', (bucket, optionId) => {
      expect(resolveBucketRange(bucket, optionId, config)).toEqual({ floor: 0, ceiling: 0 })
    })
  })

  describe('opcoes abertas ("acima de X") pegam o teto da config', () => {
    it.each([
      ['cardPf', 'pf_above_26k', 26_000, 40_000],
      ['cardPj', 'pj_above_20k', 20_000, 35_000],
      ['ifood', 'ifood_above_500', 500, 800],
      ['retailAnnual', 'retail_above_10k', 10_000, 20_000],
      ['travelAnnual', 'travel_above_10k', 10_000, 20_000],
    ] as const)('%s / %s vira [%i, %i]', (bucket, optionId, floor, ceiling) => {
      expect(resolveBucketRange(bucket, optionId, config)).toEqual({ floor, ceiling })
    })
  })

  describe('opcoes de entrada ("ate X") pegam o piso da config', () => {
    it.each([
      ['cardPf', 'pf_upto_10k', 4_000, 10_000],
      ['cardPj', 'pj_upto_10k', 4_000, 10_000],
      ['retailAnnual', 'retail_upto_2k', 800, 2_000],
      ['travelAnnual', 'travel_upto_2k', 800, 2_000],
    ] as const)('%s / %s vira [%i, %i]', (bucket, optionId, floor, ceiling) => {
      expect(resolveBucketRange(bucket, optionId, config)).toEqual({ floor, ceiling })
    })
  })

  it('respeita teto e piso trocados por override de config', () => {
    const custom = new LocalCalculatorConfigProvider({
      bucketBounds: {
        ...config.bucketBounds,
        cardPf: { entryFloor: 1_000, openCap: 100_000 },
      },
    }).getConfig()

    expect(resolveBucketRange('cardPf', 'pf_above_26k', custom)).toEqual({
      floor: 26_000,
      ceiling: 100_000,
    })
    expect(resolveBucketRange('cardPf', 'pf_upto_10k', custom)).toEqual({
      floor: 1_000,
      ceiling: 10_000,
    })
  })

  it('cobre toda opcao monetaria do catalogo sem lancar erro', () => {
    for (const question of SPEND_QUESTIONS) {
      for (const option of question.options) {
        const range = resolveBucketRange(question.id, option.id, config)

        expect(range.ceiling).toBeGreaterThanOrEqual(range.floor)
        expect(range.floor).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('rejeita id de opcao que nao pertence a pergunta', () => {
    expect(() => resolveBucketRange('cardPf', 'pj_none', config)).toThrow(QuizAnswerError)
  })

  it('rejeita opcao inexistente', () => {
    expect(() => resolveBucketRange('ifood', 'ifood_1_milhao', config)).toThrow(
      /nao existe na pergunta/,
    )
  })

  it('rejeita config em que o teto aberto fica abaixo do piso da pergunta', () => {
    const broken = new LocalCalculatorConfigProvider({
      bucketBounds: {
        ...config.bucketBounds,
        // Teto de 10 mil contra uma opcao que comeca em 26 mil.
        cardPf: { entryFloor: 4_000, openCap: 10_000 },
      },
    }).getConfig()

    expect(() => resolveBucketRange('cardPf', 'pf_above_26k', broken)).toThrow(
      /Intervalo invalido/,
    )
  })
})

describe('resolveSpendProfile', () => {
  it('monta os dois cenarios do perfil alto', () => {
    const profile = resolveSpendProfile(highSpenderAnswers(), provider)

    expect(profile.floor).toEqual({
      cardPfMonthly: 26_000,
      cardPjMonthly: 20_000,
      uberMonthly: 0,
      ifoodMonthly: 500,
      retailAnnual: 10_000,
      travelAnnual: 10_000,
    })

    expect(profile.ceiling).toEqual({
      cardPfMonthly: 40_000,
      cardPjMonthly: 35_000,
      uberMonthly: 0,
      ifoodMonthly: 800,
      retailAnnual: 20_000,
      travelAnnual: 20_000,
    })
  })

  it('monta os dois cenarios do perfil de entrada', () => {
    const profile = resolveSpendProfile(
      {
        cardPf: 'pf_upto_10k',
        cardPj: 'pj_none',
        ifood: 'ifood_zero',
        retailAnnual: 'retail_upto_2k',
        travelAnnual: 'travel_upto_2k',
        travelStyle: 'style_city',
        knowledgeLevel: 'knowledge_none',
        freeTripsPerYear: 'free_zero',
        managerInterest: 'manager_maybe',
      },
      provider,
    )

    expect(profile.floor).toEqual({
      cardPfMonthly: 4_000,
      cardPjMonthly: 0,
      uberMonthly: 0,
      ifoodMonthly: 0,
      retailAnnual: 800,
      travelAnnual: 800,
    })

    expect(profile.ceiling).toEqual({
      cardPfMonthly: 10_000,
      cardPjMonthly: 0,
      uberMonthly: 0,
      ifoodMonthly: 0,
      retailAnnual: 2_000,
      travelAnnual: 2_000,
    })
  })

  it('nunca deixa o piso acima do teto em nenhum balde', () => {
    const profile = resolveSpendProfile(highSpenderAnswers(), provider)

    for (const key of Object.keys(profile.floor) as Array<keyof typeof profile.floor>) {
      expect(profile.ceiling[key]).toBeGreaterThanOrEqual(profile.floor[key])
    }
  })

  it('extrai o estilo de viagem', () => {
    expect(resolveSpendProfile(highSpenderAnswers(), provider).travelStyle).toBe('beach')

    const city = { ...highSpenderAnswers(), travelStyle: 'style_snow' }
    expect(resolveSpendProfile(city, provider).travelStyle).toBe('snow')
  })

  it('ignora as respostas de qualificacao no perfil de gasto', () => {
    const base = highSpenderAnswers()
    const other = {
      ...base,
      knowledgeLevel: 'knowledge_advanced',
      freeTripsPerYear: 'free_three_plus',
      managerInterest: 'manager_no',
    }

    expect(resolveSpendProfile(other, provider).floor).toEqual(
      resolveSpendProfile(base, provider).floor,
    )
  })

  it.each(SPEND_QUESTIONS.map((question) => question.id))(
    'falha quando a pergunta "%s" nao foi respondida',
    (missing) => {
      const answers = { ...highSpenderAnswers() }
      delete answers[missing]

      expect(() => resolveSpendProfile(answers, provider)).toThrow(
        new RegExp(`"${missing}" nao respondida`),
      )
    },
  )

  it('falha quando o estilo de viagem nao foi respondido', () => {
    const answers = { ...highSpenderAnswers() }
    delete answers.travelStyle

    expect(() => resolveSpendProfile(answers, provider)).toThrow(
      /"travelStyle" nao respondida/,
    )
  })

  it('falha quando o estilo respondido nao existe', () => {
    const answers = { ...highSpenderAnswers(), travelStyle: 'style_marte' }

    expect(() => resolveSpendProfile(answers, provider)).toThrow(QuizAnswerError)
  })
})
