import {
  DEFAULT_CALCULATOR_CONFIG,
  type CalculatorConfig,
} from '@/domain/config/calculatorConfig'

/**
 * Fonte das premissas de calculo.
 *
 * O motor depende desta interface, nunca do objeto concreto. Hoje existe apenas
 * a implementacao local versionada; se um dia a cotacao do dolar precisar mudar
 * sem redeploy, basta plugar uma implementacao remota — sem tocar em nenhuma
 * regra.
 */
export interface CalculatorConfigProvider {
  getConfig(): CalculatorConfig
}

/** Premissas versionadas no repositorio. */
export class LocalCalculatorConfigProvider implements CalculatorConfigProvider {
  private readonly config: CalculatorConfig

  constructor(overrides: Partial<CalculatorConfig> = {}) {
    this.config = { ...DEFAULT_CALCULATOR_CONFIG, ...overrides }
  }

  getConfig(): CalculatorConfig {
    return this.config
  }
}

export const defaultConfigProvider: CalculatorConfigProvider =
  new LocalCalculatorConfigProvider()
