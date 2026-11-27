// Scenario: small city, classic start (no countdown, outbreak on button press), vague pathogen hints.
export const SCENARIO = {
  id: 'hafenstadt',
  textKey: 'hafenstadt',
  seed: 0x5e2302,
  size: 'small',
  era: 'present',
  faction: 'army',
  pathogen: 'parasitic',
  patientZeroSite: 'harbor',
  farmDurationS: 480,
  classicStart: true,
  startResources: { budget: 5000, material: 300, fuel: 150, ammo: 1200, medicine: 80, food: 1200 },
  difficulty: 'hard',
  victory: { kinds: ['eradication', 'hold'], all: false },
};
