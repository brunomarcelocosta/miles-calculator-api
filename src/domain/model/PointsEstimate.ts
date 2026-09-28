/**
 * Contribuicao de uma regra num cenario, em pontos por ano.
 *
 * O detalhamento existe para que o resultado seja auditavel: o numero grande na
 * tela deixa de ser promessa e passa a ser soma verificavel.
 */
export interface RuleContribution {
  ruleId: string
  label: string
  annualPoints: number
}

export interface ScenarioEstimate {
  /** Total anual, já com o bonus de transferencia quando ele se aplica. */
  annualPoints: number
  /** Total anual antes do bonus de transferencia. */
  basePoints: number
  /** Quanto o bonus de 25% adicionou. Zero no cenario conservador. */
  transferBonusPoints: number
  contributions: RuleContribution[]
}

/**
 * Faixa apresentada no resultado.
 *
 * `min` usa o piso dos intervalos respondidos e **nao** aplica o bonus de
 * transferencia. `max` usa o teto e aplica os 25%.
 */
export interface PointsEstimate {
  min: ScenarioEstimate
  max: ScenarioEstimate
}

export function emptyScenarioEstimate(): ScenarioEstimate {
  return {
    annualPoints: 0,
    basePoints: 0,
    transferBonusPoints: 0,
    contributions: [],
  }
}
