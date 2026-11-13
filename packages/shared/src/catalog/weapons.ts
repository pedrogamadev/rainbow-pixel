export type WeaponSlot = 'primary' | 'secondary';

export type WeaponFireMode = 'auto' | 'semi' | 'pump';

export type WeaponCategory =
  'assault_rifle' | 'smg' | 'shotgun' | 'lmg' | 'dmr' | 'pistol' | 'revolver' | 'machine_pistol';

export interface WeaponDefinition {
  readonly id: string;
  readonly name: string;
  readonly slot: WeaponSlot;
  readonly category: WeaponCategory;
  /** Dano por projétil (por chumbo, quando `pellets` > 1). */
  readonly damage: number;
  /** Projéteis por disparo. */
  readonly pellets: number;
  readonly rpm: number;
  readonly fireMode: WeaponFireMode;
  readonly magazine: number;
  /** Tempo de recarga em ms. No M870 (`pump`) é o tempo por cartucho. */
  readonly reloadMs: number;
  /** Alcance efetivo em px (escopo, seção 4.1: queda de dano depois dele). */
  readonly rangePx: number;
  /** Células de parede macia que o tiro atravessa. */
  readonly penetrationCells: number;
  /** Multiplicador de velocidade de movimento. */
  readonly mobility: number;
  readonly enabled: boolean;
}

// Valores iniciais das seções 5.1 e 5.2 do escopo.
export const WEAPONS = [
  {
    id: 'm4a1',
    name: 'M4A1',
    slot: 'primary',
    category: 'assault_rifle',
    damage: 32,
    pellets: 1,
    rpm: 750,
    fireMode: 'auto',
    magazine: 30,
    reloadMs: 2400,
    rangePx: 480,
    penetrationCells: 2,
    mobility: 1,
    enabled: true,
  },
  {
    id: 'mp5',
    name: 'MP5',
    slot: 'primary',
    category: 'smg',
    damage: 26,
    pellets: 1,
    rpm: 800,
    fireMode: 'auto',
    magazine: 30,
    reloadMs: 2100,
    rangePx: 320,
    penetrationCells: 1,
    mobility: 1.05,
    enabled: true,
  },
  {
    id: 'm870',
    name: 'M870',
    slot: 'primary',
    category: 'shotgun',
    damage: 12,
    pellets: 8,
    rpm: 70,
    fireMode: 'pump',
    magazine: 6,
    reloadMs: 500,
    rangePx: 160,
    penetrationCells: 1,
    mobility: 1,
    enabled: true,
  },
  {
    id: 'm249',
    name: 'M249',
    slot: 'primary',
    category: 'lmg',
    damage: 30,
    pellets: 1,
    rpm: 750,
    fireMode: 'auto',
    magazine: 100,
    reloadMs: 5000,
    rangePx: 520,
    penetrationCells: 3,
    mobility: 0.85,
    enabled: true,
  },
  {
    id: 'sr-25',
    name: 'SR-25',
    slot: 'primary',
    category: 'dmr',
    damage: 60,
    pellets: 1,
    rpm: 300,
    fireMode: 'semi',
    magazine: 20,
    reloadMs: 2800,
    rangePx: 640,
    penetrationCells: 3,
    mobility: 0.9,
    enabled: true,
  },
  {
    id: 'm9',
    name: 'M9',
    slot: 'secondary',
    category: 'pistol',
    damage: 30,
    pellets: 1,
    rpm: 450,
    fireMode: 'semi',
    magazine: 15,
    reloadMs: 1800,
    rangePx: 280,
    penetrationCells: 1,
    mobility: 1,
    enabled: true,
  },
  {
    id: 'magnum-357',
    name: '.357 Magnum',
    slot: 'secondary',
    category: 'revolver',
    damage: 55,
    pellets: 1,
    rpm: 180,
    fireMode: 'semi',
    magazine: 6,
    reloadMs: 3000,
    rangePx: 320,
    penetrationCells: 2,
    mobility: 1,
    enabled: true,
  },
  {
    id: 'skorpion-vz61',
    name: 'Skorpion vz. 61',
    slot: 'secondary',
    category: 'machine_pistol',
    damage: 20,
    pellets: 1,
    rpm: 850,
    fireMode: 'auto',
    magazine: 20,
    reloadMs: 1900,
    rangePx: 220,
    penetrationCells: 0,
    mobility: 1,
    enabled: true,
  },
] as const satisfies readonly WeaponDefinition[];

export type WeaponId = (typeof WEAPONS)[number]['id'];
