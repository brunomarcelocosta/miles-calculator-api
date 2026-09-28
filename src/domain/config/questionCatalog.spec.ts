
import {
  findOption,
  getQuestion,
  QUESTIONS,
  SPEND_QUESTIONS,
} from '@/domain/config/questionCatalog'
import {
  PROFILE_QUESTION_IDS,
  QUALIFICATION_QUESTION_IDS,
  SPEND_BUCKET_IDS,
  TRAVEL_STYLES,
} from '@/domain/model/QuizAnswers'

describe('questionCatalog', () => {
  it('tem as nove perguntas do funil', () => {
    expect(QUESTIONS).toHaveLength(9)
  })

  it('cobre exatamente os cinco baldes de gasto, um por pergunta', () => {
    expect(SPEND_QUESTIONS.map((question) => question.id)).toEqual([...SPEND_BUCKET_IDS])
  })

  it('tem uma pergunta de perfil e tres de qualificacao', () => {
    const profile = QUESTIONS.filter((question) => question.kind === 'profile')
    const qualification = QUESTIONS.filter((question) => question.kind === 'qualification')

    expect(profile.map((question) => question.id)).toEqual([...PROFILE_QUESTION_IDS])
    expect(qualification.map((question) => question.id)).toEqual([
      ...QUALIFICATION_QUESTION_IDS,
    ])
  })

  it('nao repete id de pergunta', () => {
    const ids = QUESTIONS.map((question) => question.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('nao repete id de opcao em todo o catalogo', () => {
    const optionIds = QUESTIONS.flatMap((question) =>
      question.options.map((option) => option.id),
    )

    expect(new Set(optionIds).size).toBe(optionIds.length)
  })

  it('da pelo menos duas opcoes e um rotulo nao vazio em cada pergunta', () => {
    for (const question of QUESTIONS) {
      expect(question.options.length).toBeGreaterThanOrEqual(2)
      expect(question.title.trim()).not.toBe('')

      for (const option of question.options) {
        expect(option.label.trim()).not.toBe('')
      }
    }
  })

  describe('perguntas monetarias', () => {
    it('declara intervalo em R$ em toda opcao', () => {
      for (const question of SPEND_QUESTIONS) {
        for (const option of question.options) {
          expect(option.amount).toBeDefined()
        }
      }
    })

    it('nunca deixa o teto abaixo do piso quando ambos existem', () => {
      for (const question of SPEND_QUESTIONS) {
        for (const option of question.options) {
          const amount = option.amount

          if (amount?.min != null && amount.max != null) {
            expect(amount.max).toBeGreaterThanOrEqual(amount.min)
          }
        }
      }
    })

    it('nao usa valor negativo', () => {
      for (const question of SPEND_QUESTIONS) {
        for (const option of question.options) {
          const amount = option.amount

          if (amount?.min != null) expect(amount.min).toBeGreaterThanOrEqual(0)
          if (amount?.max != null) expect(amount.max).toBeGreaterThanOrEqual(0)
        }
      }
    })

    it('tem no maximo uma opcao aberta e uma de entrada por pergunta', () => {
      for (const question of SPEND_QUESTIONS) {
        const open = question.options.filter((option) => option.amount?.max == null)
        const entry = question.options.filter((option) => option.amount?.min == null)

        expect(open.length).toBeLessThanOrEqual(1)
        expect(entry.length).toBeLessThanOrEqual(1)
      }
    })

    it('coloca a opcao aberta no fim da lista', () => {
      for (const question of SPEND_QUESTIONS) {
        const openIndex = question.options.findIndex((option) => option.amount?.max == null)

        if (openIndex >= 0) {
          expect(openIndex).toBe(question.options.length - 1)
        }
      }
    })

    it('declara a periodicidade de cada balde', () => {
      const periods = Object.fromEntries(
        SPEND_QUESTIONS.map((question) => [question.id, question.period]),
      )

      expect(periods).toEqual({
        cardPf: 'monthly',
        cardPj: 'monthly',
        ifood: 'monthly',
        retailAnnual: 'annual',
        travelAnnual: 'annual',
      })
    })
  })

  describe('pergunta de estilo', () => {
    it('mapeia os tres estilos de viagem, sem sobra nem falta', () => {
      const styles = getQuestion('travelStyle').options.map((option) => option.travelStyle)

      expect(styles).toEqual([...TRAVEL_STYLES])
    })
  })

  describe('perguntas de qualificacao', () => {
    it('nao declara intervalo em R$, porque nao entram no calculo', () => {
      const qualification = QUESTIONS.filter((question) => question.kind === 'qualification')

      for (const question of qualification) {
        for (const option of question.options) {
          expect(option.amount).toBeUndefined()
        }
      }
    })
  })

  describe('getQuestion', () => {
    it('devolve a pergunta pelo id', () => {
      expect(getQuestion('cardPf').title).toContain('cartão de crédito pessoal')
    })

    it('falha alto quando o id nao existe', () => {
      // @ts-expect-error id fora do catalogo, de proposito
      expect(() => getQuestion('inexistente')).toThrow(/Pergunta desconhecida/)
    })
  })

  describe('findOption', () => {
    it('encontra a opcao pelo id', () => {
      expect(findOption(getQuestion('cardPf'), 'pf_11_15k')?.label).toBe(
        'R$ 11 mil a R$ 15 mil',
      )
    })

    it('devolve undefined quando a opcao nao pertence a pergunta', () => {
      expect(findOption(getQuestion('cardPf'), 'pj_none')).toBeUndefined()
    })
  })
})
