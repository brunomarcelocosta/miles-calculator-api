
import { DESTINATIONS } from '@/domain/catalog/destinations'
import type { Destination } from '@/domain/model/Destination'
import type { PointsEstimate } from '@/domain/model/PointsEstimate'
import { TRAVEL_STYLES, type TravelStyle } from '@/domain/model/QuizAnswers'
import {
  DestinationRecommender,
  RECOMMENDATION_COUNT,
  pickEvenlySpread,
} from '@/domain/services/DestinationRecommender'

function estimate(min: number, max: number): PointsEstimate {
  return {
    min: { annualPoints: min, basePoints: min, transferBonusPoints: 0, contributions: [] },
    max: {
      annualPoints: max,
      basePoints: max,
      transferBonusPoints: 0,
      contributions: [],
    },
  }
}

const recommender = new DestinationRecommender()

function beachDestination(id: string, economy: number, business: number): Destination {
  return {
    id,
    name: id,
    country: 'Teste',
    region: 'brasil',
    styles: ['beach'],
    miles: { economy, business },
    image: `/destinations/${id}.webp`,
    blurb: id,
  }
}

describe('pickEvenlySpread', () => {
  it('devolve a lista inteira quando ela ja tem o tamanho pedido', () => {
    expect(pickEvenlySpread([1, 2, 3], 3)).toEqual([1, 2, 3])
  })

  it('devolve a lista inteira quando ela e menor que o pedido', () => {
    expect(pickEvenlySpread([1, 2], 5)).toEqual([1, 2])
  })

  it('mantem as duas pontas ao reduzir', () => {
    const picked = pickEvenlySpread([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5)

    expect(picked[0]).toBe(1)
    expect(picked.at(-1)).toBe(10)
    expect(picked).toHaveLength(5)
  })

  it('espalha em vez de pegar os primeiros', () => {
    expect(pickEvenlySpread([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5)).toEqual([1, 3, 6, 8, 10])
  })

  it('nao repete item', () => {
    const picked = pickEvenlySpread([1, 2, 3, 4, 5, 6], 5)

    expect(new Set(picked).size).toBe(picked.length)
  })

  it('devolve lista vazia para contagem zero', () => {
    expect(pickEvenlySpread([1, 2, 3], 0)).toEqual([])
  })

  it('devolve o mais caro quando pedem apenas um', () => {
    expect(pickEvenlySpread([1, 2, 3], 1)).toEqual([3])
  })
})

describe('DestinationRecommender', () => {
  describe('sempre devolve cinco', () => {
    it.each(TRAVEL_STYLES)('para o estilo %s com saldo alto', (style) => {
      expect(recommender.recommend(estimate(358_000, 816_111), style)).toHaveLength(
        RECOMMENDATION_COUNT,
      )
    })

    it.each(TRAVEL_STYLES)('para o estilo %s com saldo baixo', (style) => {
      expect(recommender.recommend(estimate(15_000, 30_000), style)).toHaveLength(
        RECOMMENDATION_COUNT,
      )
    })

    it.each(TRAVEL_STYLES)('para o estilo %s com saldo zero', (style) => {
      expect(recommender.recommend(estimate(0, 0), style)).toHaveLength(RECOMMENDATION_COUNT)
    })
  })

  describe('coerencia com o estilo escolhido', () => {
    it.each(TRAVEL_STYLES)('só sugere destino marcado como %s', (style) => {
      for (const item of recommender.recommend(estimate(358_000, 816_111), style)) {
        expect(item.destination.styles).toContain(style)
      }
    })

    it('muda a lista quando o estilo muda', () => {
      const beach = recommender
        .recommend(estimate(358_000, 816_111), 'beach')
        .map((item) => item.destination.id)
      const snow = recommender
        .recommend(estimate(358_000, 816_111), 'snow')
        .map((item) => item.destination.id)

      expect(beach).not.toEqual(snow)
    })

    it('nao repete destino na mesma lista', () => {
      for (const style of TRAVEL_STYLES) {
        const ids = recommender
          .recommend(estimate(358_000, 816_111), style)
          .map((item) => item.destination.id)

        expect(new Set(ids).size).toBe(ids.length)
      }
    })
  })

  describe('escada, do garantido ao aspiracional', () => {
    it('ordena por milhagem crescente', () => {
      const items = recommender.recommend(estimate(60_000, 200_000), 'beach')

      for (let i = 1; i < items.length; i += 1) {
        expect(items[i]!.requiredMiles).toBeGreaterThanOrEqual(items[i - 1]!.requiredMiles)
      }
    })

    it('comeca por algo que cabe no cenario conservador', () => {
      const items = recommender.recommend(estimate(60_000, 200_000), 'beach')

      expect(items[0]!.withinMinimum).toBe(true)
    })

    it('termina em algo que so cabe no cenario otimista', () => {
      const items = recommender.recommend(estimate(60_000, 200_000), 'beach')

      const last = items.at(-1)!
      expect(last.withinMaximum).toBe(true)
      expect(last.withinMinimum).toBe(false)
    })

    it('mistura garantidos e aspiracionais em vez de so um dos dois', () => {
      const items = recommender.recommend(estimate(60_000, 200_000), 'city')

      expect(items.some((item) => item.withinMinimum)).toBe(true)
      expect(items.some((item) => !item.withinMinimum)).toBe(true)
    })
  })

  describe('escolha de classe', () => {
    describe('cascata, verificada sobre um catalogo controlado', () => {
      // Cinco destinos para todos entrarem na lista, e assim cada degrau da
      // cascata poder ser inspecionado isoladamente.
      const catalog: Destination[] = [
        beachDestination('barato', 10_000, 20_000),
        beachDestination('medio', 30_000, 90_000),
        beachDestination('caro', 60_000, 140_000),
        beachDestination('caríssimo', 130_000, 300_000),
        beachDestination('inalcancavel', 400_000, 800_000),
      ]
      // Piso 50.000, teto 150.000.
      const items = new DestinationRecommender(catalog).recommend(
        estimate(50_000, 150_000),
        'beach',
      )
      const byId = new Map(items.map((item) => [item.destination.id, item]))

      it('usa executiva quando ela cabe no piso', () => {
        expect(byId.get('barato')).toMatchObject({
          cabin: 'business',
          requiredMiles: 20_000,
          withinMinimum: true,
        })
      })

      it('usa economica quando só ela cabe no piso', () => {
        expect(byId.get('medio')).toMatchObject({
          cabin: 'economy',
          requiredMiles: 30_000,
          withinMinimum: true,
        })
      })

      it('usa executiva no cenario otimista quando ela nao cabe no piso', () => {
        expect(byId.get('caro')).toMatchObject({
          cabin: 'business',
          requiredMiles: 140_000,
          withinMinimum: false,
          withinMaximum: true,
        })
      })

      it('cai para economica quando a executiva nao cabe nem no teto', () => {
        expect(byId.get('caríssimo')).toMatchObject({
          cabin: 'economy',
          requiredMiles: 130_000,
          withinMinimum: false,
          withinMaximum: true,
        })
      })

      it('marca fora de alcance quando nem a economica cabe', () => {
        expect(byId.get('inalcancavel')).toMatchObject({
          cabin: 'economy',
          requiredMiles: 400_000,
          withinMinimum: false,
          withinMaximum: false,
        })
      })
    })

    it('cobra a milhagem da classe que anunciou', () => {
      for (const style of TRAVEL_STYLES) {
        for (const item of recommender.recommend(estimate(100_000, 300_000), style)) {
          expect(item.requiredMiles).toBe(
            item.destination.miles[item.cabin],
          )
        }
      }
    })

    it('nunca marca como garantido algo acima do cenario minimo', () => {
      const min = 100_000

      for (const style of TRAVEL_STYLES) {
        for (const item of recommender.recommend(estimate(min, 300_000), style)) {
          if (item.withinMinimum) {
            expect(item.requiredMiles).toBeLessThanOrEqual(min)
          }
        }
      }
    })

    it('nunca marca como alcancavel algo acima do cenario maximo', () => {
      const max = 120_000

      for (const style of TRAVEL_STYLES) {
        for (const item of recommender.recommend(estimate(50_000, max), style)) {
          if (item.withinMaximum) {
            expect(item.requiredMiles).toBeLessThanOrEqual(max)
          }
        }
      }
    })
  })

  describe('fallback quando nada cabe na faixa', () => {
    it('ainda devolve cinco, sinalizando que estao fora de alcance', () => {
      const items = recommender.recommend(estimate(0, 1_000), 'beach')

      expect(items).toHaveLength(RECOMMENDATION_COUNT)
      expect(items.every((item) => !item.withinMaximum)).toBe(true)
      expect(items.every((item) => !item.withinMinimum)).toBe(true)
    })

    it('mostra os mais baratos primeiro, para o alvo parecer possivel', () => {
      const items = recommender.recommend(estimate(0, 1_000), 'beach')

      expect(items[0]!.destination.id).toBe('maceio')
      expect(items[0]!.cabin).toBe('economy')
    })

    it('mostra tudo o que cabe antes de completar com o que nao cabe', () => {
      // Em economica, só Maceió (28.000), Jericoacoara e Porto de Galinhas
      // (30.000) cabem em 31.000.
      const items = recommender.recommend(estimate(0, 31_000), 'beach')

      expect(items).toHaveLength(RECOMMENDATION_COUNT)

      const reachable = items.filter((item) => item.withinMaximum)
      expect(reachable).toHaveLength(3)
      expect(reachable.map((item) => item.destination.id)).toEqual([
        'maceio',
        'jericoacoara',
        'porto-de-galinhas',
      ])

      // Os que faltam vem em seguida, do mais proximo ao mais distante, para
      // funcionarem como proxima meta em vez de frustracao.
      const outOfReach = items.filter((item) => !item.withinMaximum)
      expect(outOfReach).toHaveLength(2)
      expect(outOfReach[0]!.destination.id).toBe('fernando-de-noronha')
    })

    it('nao intercala inalcancavel no meio dos alcancaveis', () => {
      const items = recommender.recommend(estimate(0, 31_000), 'beach')
      const firstOutOfReach = items.findIndex((item) => !item.withinMaximum)

      for (let i = firstOutOfReach; i < items.length; i += 1) {
        expect(items[i]!.withinMaximum).toBe(false)
      }
    })

    it('cai para o catalogo inteiro se o estilo nao existir no catalogo', () => {
      const catalogWithoutSnow = DESTINATIONS.filter(
        (destination) => !destination.styles.includes('snow'),
      )
      const limited = new DestinationRecommender(catalogWithoutSnow)

      const items = limited.recommend(estimate(100_000, 300_000), 'snow')

      expect(items).toHaveLength(RECOMMENDATION_COUNT)
    })
  })

  describe('catalogo injetado', () => {
    const tiny: Destination[] = [
      {
        id: 'a',
        name: 'A',
        country: 'X',
        region: 'brasil',
        styles: ['beach'],
        miles: { economy: 10_000, business: 20_000 },
        image: '/destinations/a.webp',
        blurb: 'a',
      },
      {
        id: 'b',
        name: 'B',
        country: 'X',
        region: 'brasil',
        styles: ['beach'],
        miles: { economy: 30_000, business: 60_000 },
        image: '/destinations/b.webp',
        blurb: 'b',
      },
    ]

    it('nao inventa destino para preencher a lista', () => {
      const items = new DestinationRecommender(tiny).recommend(
        estimate(50_000, 100_000),
        'beach',
      )

      expect(items).toHaveLength(2)
    })

    it('respeita a contagem pedida', () => {
      const items = recommender.recommend(estimate(358_000, 816_111), 'beach', 3)

      expect(items).toHaveLength(3)
    })
  })

  describe('perfil de referencia do planejamento', () => {
    const reference = estimate(358_000, 816_111)

    it.each(TRAVEL_STYLES)('gera lista integralmente alcancavel para %s', (style) => {
      // Com 358 mil no piso, todo o catalogo cabe: a escada fica entre o melhor
      // uso garantido e o topo do catalogo.
      for (const item of recommender.recommend(reference, style)) {
        expect(item.withinMaximum).toBe(true)
      }
    })

    it('oferece executiva em tudo, porque o piso ja paga', () => {
      const items = recommender.recommend(reference, 'beach')

      expect(items.every((item) => item.cabin === 'business')).toBe(true)
    })

    it('termina no destino mais caro do estilo', () => {
      const style: TravelStyle = 'snow'
      const items = recommender.recommend(reference, style)

      const priciest = Math.max(
        ...DESTINATIONS.filter((destination) => destination.styles.includes(style)).map(
          (destination) => destination.miles.business,
        ),
      )

      expect(items.at(-1)!.requiredMiles).toBe(priciest)
    })
  })
})
