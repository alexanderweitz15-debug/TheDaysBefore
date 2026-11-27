// Scenario: medium city, normal difficulty, visible countdown (GDD 6).
export const SCENARIO = {
  id: 'rheinstadt',
  textKey: 'rheinstadt',
  seed: 0x5e2301,
  size: 'medium',
  era: 'present',
  faction: 'army',
  pathogen: 'viral',
  patientZeroSite: 'hospital',
  farmDurationS: 600,
  classicStart: false,
  startResources: { budget: 6000, material: 400, fuel: 200, ammo: 1500, medicine: 100, food: 1500 },
  difficulty: 'normal',
  victory: { kinds: ['hold', 'evacuation'], all: false },
  holdUntilS: 900,
  medals: { bronze: 2000, silver: 5000, gold: 9000 },
};
