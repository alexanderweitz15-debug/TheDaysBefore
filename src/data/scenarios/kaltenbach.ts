// Scenario: medium industrial town, chemical pathogen from the power plant, containment or eradication.
export const SCENARIO = {
  id: 'kaltenbach',
  textKey: 'kaltenbach',
  seed: 0x5e2303,
  size: 'medium',
  era: 'present',
  faction: 'army',
  pathogen: 'chemical',
  patientZeroSite: 'powerplant',
  farmDurationS: 540,
  classicStart: false,
  startResources: { budget: 5500, material: 500, fuel: 250, ammo: 1300, medicine: 120, food: 1300 },
  difficulty: 'normal',
  victory: { kinds: ['containment', 'eradication'], all: false },
  medals: { bronze: 2000, silver: 5000, gold: 9000 },
};
