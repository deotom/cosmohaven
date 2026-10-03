export type SpeciesId = 'human' | 'lumijelly' | 'felinian' | 'synthbot' | 'floran'

export type Species = {
  id: SpeciesId
  name: string
  tagline: string
  /** The racial passives, as shown on the registration screen */
  traits: string[]

  /** Multipliers and flags that the gameplay systems read */
  hungerDecay: number
  sanityDecay: number
  /** Speed of walking around the ship */
  walkSpeed: number
  /** Speed of the Scrap harvesting beam */
  harvestSpeed: number
  /** Reach of the auto-pilot's scrap scan */
  scanRange: number
  /** Hull integrity regained per second, with no repair kit needed */
  shipRepair: number
  /** Never gets hungry: Hunger stays at 0 and food is never needed */
  hungerImmune: boolean
  /** Regains Sanity and Hunger while in sunlight or lamplight */
  photosynthesis: boolean
  /** Sees incoming meteors on the HUD well before they arrive */
  meteorWarning: boolean
  /** Gives off its own light */
  glows: boolean
}

const base: Omit<Species, 'id' | 'name' | 'tagline' | 'traits'> = {
  hungerDecay: 1,
  sanityDecay: 1,
  walkSpeed: 1,
  harvestSpeed: 1,
  scanRange: 1,
  shipRepair: 0,
  hungerImmune: false,
  photosynthesis: false,
  meteorWarning: false,
  glows: false,
}

export const SPECIES: Record<SpeciesId, Species> = {
  human: {
    ...base,
    id: 'human',
    name: 'Human',
    tagline: 'Adaptable and balanced',
    traits: ['Adaptable: Hunger and Sanity drain 15% slower'],
    hungerDecay: 0.85,
    sanityDecay: 0.85,
  },
  lumijelly: {
    ...base,
    id: 'lumijelly',
    name: 'Lumi-Jelly',
    tagline: 'A bioluminescent drifter',
    traits: ['Glows in the dark', 'Passively repairs the ship’s hull'],
    shipRepair: 0.4,
    glows: true,
  },
  felinian: {
    ...base,
    id: 'felinian',
    name: 'Felinian',
    tagline: 'Space catfolk with quick paws',
    traits: ['+30% movement speed on board', 'Early meteor warnings on the HUD'],
    walkSpeed: 1.3,
    meteorWarning: true,
  },
  synthbot: {
    ...base,
    id: 'synthbot',
    name: 'Synth-Bot',
    tagline: 'A friendly android',
    traits: ['Immune to Hunger', '+25% Scrap beam speed', 'Stress builds faster: needs the Arcade'],
    hungerImmune: true,
    harvestSpeed: 1.25,
    sanityDecay: 1.25,
  },
  floran: {
    ...base,
    id: 'floran',
    name: 'Floran',
    tagline: 'Plantfolk who love the sun',
    traits: ['Regrows Sanity and Hunger in sunlight or lamplight', '+20% auto-pilot scan range'],
    photosynthesis: true,
    scanRange: 1.2,
  },
}

/** Every customization choice, across all species. Only the ones for the chosen species are shown and used. */
export type Look = {
  // Human
  hairStyle: string
  skinTone: string
  outfitColor: string
  // Lumi-Jelly
  jellyColor: string
  antennaStyle: string
  // Felinian
  earType: string
  tailStyle: string
  furPattern: string
  furColor: string
  // Synth-Bot
  shellColor: string
  faceStyle: string
  // Floran
  sproutType: string
  leafTone: string
}

export const DEFAULT_LOOK: Look = {
  hairStyle: 'short',
  skinTone: '#f2c9a0',
  outfitColor: '#ff8a2b',
  jellyColor: '#4dd0ff',
  antennaStyle: 'orb',
  earType: 'pointed',
  tailStyle: 'long',
  furPattern: 'tabby',
  furColor: '#e8913a',
  shellColor: '#dfe6f0',
  faceStyle: 'smile',
  sproutType: 'sprout',
  leafTone: '#6fcf5a',
}

export type Choice = { id: string; label: string; swatch?: string }
export type OptionDef = { key: keyof Look; label: string; choices: Choice[] }

const swatches = (colors: [string, string][]): Choice[] => colors.map(([id, label]) => ({ id, label, swatch: id }))

export const SPECIES_OPTIONS: Record<SpeciesId, OptionDef[]> = {
  human: [
    {
      key: 'hairStyle',
      label: 'HAIR STYLE',
      choices: [
        { id: 'short', label: 'Short' },
        { id: 'long', label: 'Long' },
        { id: 'bun', label: 'Bun' },
        { id: 'spiky', label: 'Spiky' },
        { id: 'bald', label: 'None' },
      ],
    },
    {
      key: 'skinTone',
      label: 'SKIN TONE',
      choices: swatches([
        ['#fbe0c8', 'Fair'],
        ['#f2c9a0', 'Light'],
        ['#d9a273', 'Tan'],
        ['#b9784a', 'Brown'],
        ['#8a5232', 'Deep'],
        ['#5c3822', 'Dark'],
      ]),
    },
    {
      key: 'outfitColor',
      label: 'OUTFIT COLOUR',
      choices: swatches([
        ['#ff8a2b', 'Orange'],
        ['#ff4d6d', 'Rose'],
        ['#ffd23f', 'Sun'],
        ['#4dd0ff', 'Sky'],
        ['#4dff88', 'Mint'],
        ['#b57cff', 'Violet'],
        ['#f1f4f8', 'White'],
        ['#2b2f3a', 'Night'],
      ]),
    },
  ],
  lumijelly: [
    {
      key: 'jellyColor',
      label: 'JELLY COLOUR',
      choices: swatches([
        ['#4dd0ff', 'Azure'],
        ['#ff6ad5', 'Pink'],
        ['#7dff9a', 'Lime'],
        ['#ffb347', 'Amber'],
        ['#b57cff', 'Violet'],
        ['#ff5d5d', 'Coral'],
      ]),
    },
    {
      key: 'antennaStyle',
      label: 'ANTENNA GLOW',
      choices: [
        { id: 'orb', label: 'Orb' },
        { id: 'twin', label: 'Twin' },
        { id: 'curl', label: 'Curl' },
        { id: 'tri', label: 'Tri-Glow' },
      ],
    },
  ],
  felinian: [
    {
      key: 'earType',
      label: 'EAR TYPE',
      choices: [
        { id: 'pointed', label: 'Pointed' },
        { id: 'round', label: 'Round' },
        { id: 'folded', label: 'Folded' },
        { id: 'tufted', label: 'Tufted' },
      ],
    },
    {
      key: 'tailStyle',
      label: 'TAIL STYLE',
      choices: [
        { id: 'long', label: 'Long' },
        { id: 'fluffy', label: 'Fluffy' },
        { id: 'bob', label: 'Bobtail' },
        { id: 'ringed', label: 'Ringed' },
      ],
    },
    {
      key: 'furPattern',
      label: 'FUR PATTERN',
      choices: [
        { id: 'solid', label: 'Solid' },
        { id: 'tabby', label: 'Tabby' },
        { id: 'calico', label: 'Calico' },
        { id: 'tuxedo', label: 'Tuxedo' },
        { id: 'spotted', label: 'Spotted' },
      ],
    },
    {
      key: 'furColor',
      label: 'FUR COLOUR',
      choices: swatches([
        ['#f0d9b5', 'Cream'],
        ['#e8913a', 'Ginger'],
        ['#8c93a3', 'Grey'],
        ['#2f2f38', 'Black'],
        ['#f4f4f4', 'White'],
        ['#8a5a3c', 'Brown'],
      ]),
    },
  ],
  synthbot: [
    {
      key: 'shellColor',
      label: 'BODY SHELL COLOUR',
      choices: swatches([
        ['#dfe6f0', 'Chrome'],
        ['#ff6a5d', 'Red'],
        ['#ffc94d', 'Gold'],
        ['#5dd0ff', 'Blue'],
        ['#7dff9a', 'Green'],
        ['#c58cff', 'Purple'],
        ['#ff9ad0', 'Pink'],
        ['#3a4150', 'Graphite'],
      ]),
    },
    {
      key: 'faceStyle',
      label: 'LED FACE',
      choices: [
        { id: 'smile', label: 'Smile' },
        { id: 'happy', label: 'Happy ^ ^' },
        { id: 'dots', label: 'Dots' },
        { id: 'wave', label: 'Wave' },
        { id: 'heart', label: 'Heart' },
      ],
    },
  ],
  floran: [
    {
      key: 'sproutType',
      label: 'HEAD SPROUT',
      choices: [
        { id: 'sprout', label: 'Leaf Sprout' },
        { id: 'flower', label: 'Flower' },
        { id: 'bud', label: 'Bud' },
        { id: 'vine', label: 'Curly Vine' },
      ],
    },
    {
      key: 'leafTone',
      label: 'LEAF SKIN TONE',
      choices: swatches([
        ['#6fcf5a', 'Spring'],
        ['#3fa34d', 'Forest'],
        ['#a6e05a', 'Lime'],
        ['#4fb8a0', 'Teal'],
        ['#9bbf5a', 'Moss'],
        ['#d6d95a', 'Autumn'],
      ]),
    },
  ],
}
