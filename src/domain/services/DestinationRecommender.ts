import { DESTINATIONS } from '@/domain/catalog/destinations'
import type {
  CabinClass,
  Destination,
  DestinationRecommendation,
} from '@/domain/model/Destination'
import type { PointsEstimate } from '@/domain/model/PointsEstimate'
import type { TravelStyle } from '@/domain/model/QuizAnswers'

export const RECOMMENDATION_COUNT = 5

/**
 * Escolhe os destinos exibidos no resultado.
 *
 * A regra de ouro e a **escada**: o primeiro card precisa caber no cenario
 * conservador, para a promessa se sustentar, e o ultimo precisa ser aspiracional,
 * para dar motivo de continuar a conversa. Uma lista toda garantida nao motiva;
 * uma lista toda aspiracional nao convence.
 */
export class DestinationRecommender {
  private readonly catalog: readonly Destination[]

  constructor(catalog: readonly Destination[] = DESTINATIONS) {
    this.catalog = catalog
  }

  recommend(
    estimate: PointsEstimate,
    style: TravelStyle,
    count: number = RECOMMENDATION_COUNT,
  ): DestinationRecommendation[] {
    const minPoints = estimate.min.annualPoints
    const maxPoints = estimate.max.annualPoints

    // Se o estilo escolhido nao tiver destino no catalogo, e melhor mostrar o
    // catalogo inteiro que devolver uma tela vazia.
    const styled = this.catalog.filter((destination) => destination.styles.includes(style))
    const candidates = styled.length > 0 ? styled : this.catalog

    const offers = candidates
      .map((destination) => buildOffer(destination, minPoints, maxPoints))
      .sort(byRequiredMilesThenName)

    const viable = offers.filter((offer) => offer.withinMaximum)

    if (viable.length >= count) {
      return pickEvenlySpread(viable, count)
    }

    // Com poucos destinos ao alcance, espalhar seria cruel: sobrariam quatro
    // cards inalcancaveis. Mostramos primeiro tudo o que cabe e completamos com
    // os mais baratos que ainda nao cabem, que funcionam como proxima meta.
    const outOfReach = offers.filter((offer) => !offer.withinMaximum)

    return [...viable, ...outOfReach].slice(0, count)
  }
}

/**
 * Decide em que classe o destino e oferecido.
 *
 * A cascata tenta, nesta ordem: executiva garantida, economica garantida,
 * executiva no cenario otimista, economica no cenario otimista.
 *
 * O que ela protege e o primeiro degrau da escada. Escolher sempre a melhor
 * classe que cabe no **teto** parece generoso, mas apaga a coluna do garantido:
 * um destino de R$ 20 mil em economica, que a pessoa alcanca com certeza, seria
 * anunciado em executiva como "no cenario maximo" — e a lista inteira passaria a
 * depender do otimismo. Priorizar o que cabe no **piso** mantem pelo menos uma
 * promessa que se sustenta.
 */
function buildOffer(
  destination: Destination,
  minPoints: number,
  maxPoints: number,
): DestinationRecommendation {
  const { economy, business } = destination.miles

  if (business <= minPoints) {
    return recommendation(destination, 'business', business, true, true)
  }

  if (economy <= minPoints) {
    return recommendation(destination, 'economy', economy, true, true)
  }

  if (business <= maxPoints) {
    return recommendation(destination, 'business', business, false, true)
  }

  if (economy <= maxPoints) {
    return recommendation(destination, 'economy', economy, false, true)
  }

  return recommendation(destination, 'economy', economy, false, false)
}

function recommendation(
  destination: Destination,
  cabin: CabinClass,
  requiredMiles: number,
  withinMinimum: boolean,
  withinMaximum: boolean,
): DestinationRecommendation {
  return { destination, cabin, requiredMiles, withinMinimum, withinMaximum }
}

/** Empate em milhas resolve pelo nome, para a ordem ser estavel entre execucoes. */
function byRequiredMilesThenName(
  a: DestinationRecommendation,
  b: DestinationRecommendation,
): number {
  if (a.requiredMiles !== b.requiredMiles) {
    return a.requiredMiles - b.requiredMiles
  }

  return a.destination.name.localeCompare(b.destination.name, 'pt-BR')
}

/**
 * Retira `count` itens de uma lista ordenada mantendo as duas pontas.
 *
 * Pegar os `count` primeiros deixaria a lista inteira no piso e sem aspiracao;
 * espalhar preserva a progressao do mais garantido ao mais ambicioso.
 */
export function pickEvenlySpread<T>(sorted: readonly T[], count: number): T[] {
  if (count <= 0) return []
  if (sorted.length <= count) return [...sorted]
  if (count === 1) return [sorted[sorted.length - 1]!]

  const lastIndex = sorted.length - 1
  const picked: T[] = []

  for (let i = 0; i < count; i += 1) {
    const index = Math.round((i * lastIndex) / (count - 1))
    picked.push(sorted[index]!)
  }

  return picked
}
