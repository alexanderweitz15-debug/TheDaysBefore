// M0 dummy simulation parameters. Replaced by real map and agent data in M1.

export interface DummySimConfig {
  widthM: number;
  heightM: number;
  capacity: number;
  initialAgents: number;
  /** Walking speed in meters per second. */
  speedMps: number;
  /** Max heading change per tick in radians. */
  headingJitterRad: number;
  /** Radius of a DebugSpawn burst in meters. */
  spawnRadiusM: number;
}

export const DUMMY_SIM: DummySimConfig = {
  widthM: 2000,
  heightM: 2000,
  capacity: 60_000,
  initialAgents: 2_000,
  speedMps: 1.4,
  headingJitterRad: 0.25,
  spawnRadiusM: 50,
};
