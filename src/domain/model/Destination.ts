import type { TravelStyle } from '@/domain/model/QuizAnswers'

export const DESTINATION_REGIONS = [
  'brasil',
  'america-do-sul',
  'america-do-norte',
  'europa',
  'caribe',
] as const

export type DestinationRegion = (typeof DESTINATION_REGIONS)[number]

export const CABIN_CLASSES = ['economy', 'business'] as const

export type CabinClass = (typeof CABIN_CLASSES)[number]

/** Custo de ida e volta, em milhas, por classe. */
export interface DestinationMiles {
  economy: number
  business: number
}

export interface Destination {
  id: string
  name: string
  country: string
  region: DestinationRegion
  /** Estilos aos quais o destino atende. Um destino pode servir a mais de um. */
  styles: TravelStyle[]
  miles: DestinationMiles
  /** Caminho da imagem em `public/destinations`. */
  image: string
  /** Uma linha de copy, exibida no card. */
  blurb: string
}

/**
 * Destino recomendado, ja resolvido para a classe que cabe no orcamento de
 * pontos do usuario. O card mostra classe e milhas, o que torna a recomendacao
 * verificavel em vez de vaga.
 */
export interface DestinationRecommendation {
  destination: Destination
  cabin: CabinClass
  requiredMiles: number
  /** Cabe ja no cenario conservador: e uma promessa que se sustenta. */
  withinMinimum: boolean
  /** Cabe no cenario otimista. Falso indica destino ainda fora de alcance. */
  withinMaximum: boolean
}
