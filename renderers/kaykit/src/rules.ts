/** Name → category and variant axes for the KayKit Bits models. The first matching rule wins; every model must match one. */

export const CATEGORIES = [
  'vehicle', 'weapon', 'building', 'road', 'terrain', 'floor', 'wall', 'pillar', 'door', 'primitive', 'target', 'desk',
  'seating', 'bed', 'kitchen', 'storage', 'tech', 'light', 'plant', 'decor', 'food', 'kitchenware', 'prop',
] as const
export type Category = (typeof CATEGORIES)[number]

const RULES: [Category, RegExp][] = [
  ['vehicle', /^(car_|spacetruck|dropship|lander_[AB]$|tractor|wagon|mobile_base_(carriage|command|cargo))/],
  ['weapon', /^(gun_|ammo_|bullet|bat$|weaponrack|pitchfork)/i],
  ['building', /^(building_|watertower|basemodule_|eco_module|dome|crypt|structure_|roofmodule_|cargodepot|drill_structure|space_farm|water_storage|mobile_base_frame|lander_base|windturbine|shrine)/],
  ['road', /^(road_|park_road|path_|landingpad|tunnel_)/],
  ['terrain', /^(terrain_|rock|park_base|floor_dirt|base$)/i],
  ['floor', /^(floor|primitive_floor|primitive_slope|primitive_stairs)/i],
  ['wall', /^(wall|primitive_wall|primitive_window|primitive_doorway|park_wall|fence|maze_|arch|wooden_gate)/i],
  ['pillar', /^(pillar|primitive_pillar|primitive_beam|post$|fence_pillar)/i],
  ['door', /^door_/i],
  ['primitive', /^(primitive_cube|cube_prototype|dummy_base)/i],
  ['target', /^(target|wall_target)/i],
  ['desk', /^(desk|workbench|table_|kitchentable|cuttingboard)/i],
  ['seating', /^(chair|armchair|couch|bench|stool)/i],
  ['bed', /^bed_/],
  ['kitchen', /^(kitchencounter|kitchencabinet|fridge|oven|pizza_oven|stove|extractorhood|icecream_machine|dishrack|towelrail|shelf_papertowel|papertowel)/],
  ['storage', /^(shelf_|cabinet_|locker|box_|crate|cargo_|containers_|barrel|pallet|dumpster|trash_|haybale)/i],
  ['tech', /^(monitor|keyboard|mouse|gameconsole|solarpanel|lights$)/],
  ['light', /^(lamp_|streetlight|trafficlight|lantern|candle|post_lantern|skull_candle)/],
  ['plant', /^(bush|tree_|cactus|pumpkin)/],
  ['decor', /^(rug_|pictureframe|pillow|book_|plaque|sign_|gravemarker|gravestone|grave_|coffin|skull|ribcage|bone_|scarecrow|post_skull|menu$|candy_bucket|firehydrant|cup_pencils|mousepad)/],
  ['food', /^(food_|icecream_(bowl_|cone_|softserve|container_icecream|cherry|cookiestick|waffle$)|candy_|candycorn|lollipop|pizzabox|stew_bowl|crate_)/],
  ['kitchenware', /^(bowl|plate|pot_|pan_|lid_|jar_|knife|spoon|rollingpin|ketchup|mustard|mug_|cup$|stew_pot|icecream_(bowl|cone|container|scoop))/],
  ['prop', /^(coin_|can_)/i],
]

export function categorize(id: string, name: string): Category {
  const hit = RULES.find(([, re]) => re.test(name))
  if (!hit) throw new Error(`no category rule matches ${id}`)
  return hit[0]
}

const AXES: [string, RegExp][] = [
  ['decorated', /_decorated(_[A-Z]|_bushes|_trees)?$/],
  ['base', /_withoutBase$/],
  ['style', /_styleB$/],
  ['state', /_(dirty|broken|destroyed|stacked|packed|open|closed|cooked|uncooked|trash|chopped|pieces|slices?|grated|mashed|rings|sauce|melted|plated|jackolantern|stew|curtains_(green|red)|tablecloth_(green|red)|backsplash|countertop|pillows|headphones|wood|halloween)$/i],
  ['color', /_(blue|brown|green|orange|pink|purple|yellow|red|chocolate|strawberry|vanilla)(?=_|$)/],
  ['size', /_(small|medium|large|big|long|half|tall|low)$/i],
  ['letter', /_[A-F]$/],
]

/** Strips variant suffixes until none is left: what remains is the family. */
export function variantOf(name: string): { base: string; axes: Record<string, string> } {
  let base = name
  const axes: Record<string, string> = {}
  for (let changed = true; changed; ) {
    changed = false
    for (const [axis, re] of AXES) {
      const m = base.match(re)
      if (!m || base.length === m[0].length) continue
      axes[axis] = [m[0].slice(1), ...(axes[axis] ? [axes[axis]] : [])].join('+')
      base = base.slice(0, base.length - m[0].length)
      changed = true
    }
  }
  return { base, axes }
}
