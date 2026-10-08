import { fnv1a, mix } from './hash.ts'

const ADJECTIVES = [
  'amber', 'ashen', 'azure', 'balmy', 'bold', 'brave', 'brisk', 'bronze', 'bright', 'calm',
  'candid', 'cinder', 'chalk', 'cheery', 'chilly', 'cobalt', 'copper', 'coral', 'cosy', 'crimson',
  'crisp', 'curly', 'dapper', 'dawn', 'dusky', 'dusty', 'eager', 'early', 'ember', 'fancy',
  'feral', 'fizzy', 'fleet', 'foggy', 'frosty', 'fuzzy', 'gentle', 'giddy', 'gilded', 'glossy',
  'golden', 'grand', 'grassy', 'hasty', 'hazel', 'hazy', 'hearty', 'hidden', 'hollow', 'humble',
  'icy', 'idle', 'indigo', 'inky', 'ivory', 'jade', 'jolly', 'keen', 'kind', 'lanky',
  'late', 'leafy', 'lemon', 'lilac', 'little', 'lively', 'lofty', 'lone', 'loud', 'lucky',
  'lunar', 'magic', 'maple', 'marble', 'mellow', 'merry', 'mighty', 'minty', 'misty', 'modest',
  'mossy', 'muddy', 'murky', 'nimble', 'noble', 'odd', 'opal', 'orange', 'pale', 'peachy',
  'pearly', 'pebbly', 'plucky', 'plush', 'polar', 'proud', 'quick', 'quiet', 'rainy', 'rapid',
  'rosy', 'ruby', 'rusty', 'sandy', 'scarlet', 'shady', 'shiny', 'silent', 'silky', 'silver',
  'sleepy', 'slow', 'smoky', 'snowy', 'solar', 'sour', 'spicy', 'spry', 'stormy', 'sturdy',
  'sunny', 'swift', 'tame', 'tawny', 'teal', 'tidy', 'tiny', 'topaz', 'tropic', 'twilit',
  'velvet', 'vivid', 'wandering', 'warm', 'wavy', 'wild', 'windy', 'wintry', 'wise', 'witty',
  'woolly', 'young', 'zesty', 'zippy',
]

const NOUNS = [
  'acorn', 'anchor', 'anvil', 'apple', 'arch', 'badger', 'banjo', 'barge', 'basil', 'beacon',
  'beetle', 'bell', 'birch', 'bison', 'blossom', 'boulder', 'bramble', 'bridge', 'brook', 'buffalo',
  'cabin', 'cactus', 'camel', 'candle', 'canoe', 'canyon', 'castle', 'cedar', 'cello', 'cherry',
  'cliff', 'clover', 'comet', 'compass', 'coyote', 'crane', 'cricket', 'crow', 'dahlia', 'delta',
  'dolphin', 'dune', 'eagle', 'falcon', 'fern', 'ferry', 'fig', 'finch', 'fjord', 'flute',
  'fox', 'gecko', 'geyser', 'glacier', 'goose', 'grove', 'gull', 'harbor', 'hare', 'hawk',
  'hedgehog', 'heron', 'hill', 'iris', 'island', 'jackal', 'jaguar', 'kayak', 'kettle', 'kite',
  'koala', 'lagoon', 'lantern', 'lark', 'lemur', 'lily', 'llama', 'lynx', 'magpie', 'mango',
  'meadow', 'meteor', 'mint', 'mole', 'moose', 'moth', 'nectar', 'newt', 'oak', 'oasis',
  'octopus', 'olive', 'orchard', 'otter', 'owl', 'oyster', 'panda', 'parrot', 'peach', 'pebble',
  'pelican', 'penguin', 'pepper', 'pine', 'plum', 'pond', 'poppy', 'puffin', 'quail', 'quartz',
  'rabbit', 'radish', 'raven', 'reef', 'river', 'raccoon', 'saddle', 'salmon', 'sparrow', 'spruce',
  'squid', 'stork', 'summit', 'swan', 'thistle', 'thrush', 'tiger', 'toad', 'trout', 'tulip',
  'tundra', 'turnip', 'urchin', 'valley', 'violet', 'walrus', 'walnut', 'whale', 'willow', 'wren',
  'yak', 'zebra',
]

/**
 * A collection item's tag: two words hashed (FNV-1a) from its id, `copper-heron`. What the user and the workers call
 * an item; an id never changes, so neither does its tag. Two items may share one, rarely.
 */
export const tagOf = (id: string): string => {
  const h = mix(fnv1a(id))
  return `${ADJECTIVES[h % ADJECTIVES.length]}-${NOUNS[mix(h ^ 0x9e3779b9) % NOUNS.length]}`
}
