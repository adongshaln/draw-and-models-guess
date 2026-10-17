/**
 * The deck.
 *
 * Every word has to be drawable in under a minute by someone who cannot draw,
 * and it has to have a small set of synonyms a fair referee would accept on
 * sight. The list does not have to be complete: a guess the list misses is
 * simply judged wrong, and the model gets two more tries.
 *
 * level 1: one iconic silhouette. level 2: needs a detail or two.
 * level 3: needs an idea, not a shape.
 */
export type Word = { word: string; level: 1 | 2 | 3; also: string[] };

const DECK: [string, 1 | 2 | 3, string?][] = [
  // ---- 1: iconic silhouettes ----
  ["cat", 1, "kitten,kitty"],
  ["dog", 1, "puppy,pup,hound"],
  ["fish", 1, "goldfish"],
  ["house", 1, "home,cottage"],
  ["tree", 1, "pine tree,oak"],
  ["sun", 1, "sunshine"],
  ["moon", 1, "crescent moon,crescent"],
  ["star", 1, ""],
  ["flower", 1, "daisy,tulip,blossom"],
  ["apple", 1, ""],
  ["banana", 1, ""],
  ["car", 1, "automobile,sedan"],
  ["boat", 1, "sailboat,ship"],
  ["umbrella", 1, "parasol"],
  ["heart", 1, ""],
  ["cloud", 1, "rain cloud"],
  ["snowman", 1, "snow man"],
  ["balloon", 1, "balloons"],
  ["mushroom", 1, "toadstool"],
  ["glasses", 1, "eyeglasses,spectacles"],
  ["key", 1, ""],
  ["clock", 1, "wall clock"],
  ["envelope", 1, "letter,mail"],
  ["pizza", 1, "pizza slice,slice of pizza"],
  ["cup", 1, "mug,coffee cup"],
  ["candle", 1, ""],
  ["ladder", 1, ""],
  ["kite", 1, ""],
  ["snake", 1, "serpent"],
  ["bird", 1, ""],
  ["egg", 1, "fried egg"],
  ["bell", 1, ""],
  ["rainbow", 1, ""],
  ["pencil", 1, "crayon"],
  ["book", 1, "open book"],
  ["hat", 1, "cap"],
  ["sock", 1, ""],
  ["fork", 1, ""],
  ["carrot", 1, ""],
  ["anchor", 1, ""],
  ["door", 1, "doorway"],
  ["bone", 1, "dog bone"],
  ["donut", 1, "doughnut"],
  ["smiley face", 1, "smiley,smile,happy face"],
  ["ice cream", 1, "ice cream cone,gelato,cone"],
  ["light bulb", 1, "lightbulb,bulb"],

  // ---- 2: a detail or two ----
  ["giraffe", 2, ""],
  ["elephant", 2, ""],
  ["rabbit", 2, "bunny,hare"],
  ["turtle", 2, "tortoise"],
  ["octopus", 2, "squid"],
  ["butterfly", 2, "moth"],
  ["snail", 2, "slug"],
  ["penguin", 2, ""],
  ["owl", 2, ""],
  ["pig", 2, "piggy,hog"],
  ["cow", 2, "bull,cattle"],
  ["duck", 2, "duckling"],
  ["frog", 2, "toad"],
  ["bee", 2, "bumblebee,honeybee"],
  ["crab", 2, ""],
  ["whale", 2, "orca"],
  ["spider", 2, ""],
  ["cactus", 2, ""],
  ["windmill", 2, ""],
  ["toothbrush", 2, ""],
  ["chair", 2, "stool"],
  ["bathtub", 2, "bath,tub"],
  ["robot", 2, "android"],
  ["ghost", 2, ""],
  ["skull", 2, ""],
  ["alien", 2, "extraterrestrial"],
  ["mermaid", 2, ""],
  ["unicorn", 2, ""],
  ["dragon", 2, ""],
  ["pirate", 2, ""],
  ["ninja", 2, ""],
  ["astronaut", 2, "spaceman,cosmonaut"],
  ["snowflake", 2, ""],
  ["tornado", 2, "twister,cyclone"],
  ["lightning", 2, "lightning bolt,thunderbolt,bolt"],
  ["planet", 2, "saturn"],
  ["ferris wheel", 2, ""],
  ["traffic light", 2, "stoplight,stop light"],
  ["skateboard", 2, ""],
  ["trophy", 2, "cup trophy"],
  ["magnet", 2, "horseshoe magnet"],
  ["diamond", 2, "gem,jewel"],
  ["backpack", 2, "rucksack,school bag"],
  ["sunglasses", 2, "shades"],
  ["tooth", 2, "molar"],
  ["footprint", 2, "foot"],

  // ---- 3: needs an idea ----
  ["haircut", 3, "barber,hair cut"],
  ["sleeping", 3, "sleep,asleep,nap"],
  ["birthday", 3, "birthday party"],
  ["music", 3, "music note,musical note,song"],
  ["rain", 3, "raining,rainy"],
  ["fishing", 3, "fisherman,fishing rod"],
  ["camping", 3, ""],
  ["love", 3, ""],
  ["wifi", 3, "wi fi,wireless"],
  ["selfie", 3, ""],
  ["recycling", 3, "recycle"],
  ["gravity", 3, ""],
  ["sunrise", 3, "sunset,dawn"],
  ["vacation", 3, "holiday"],
  ["traffic jam", 3, ""],
  ["shipwreck", 3, "sinking ship"],
  ["black hole", 3, "wormhole"],
  ["juggling", 3, "juggler"],
  ["surfing", 3, "surfer,surf"],
  ["haunted house", 3, ""],
  ["magician", 3, "magic trick,wizard"],
  ["jellyfish", 3, ""],
  ["scarecrow", 3, ""],
  ["parachute", 3, "skydiving"],
];

export const WORDS: Word[] = DECK.map(([word, level, also]) => ({
  word,
  level,
  also: also ? also.split(",").map((s) => s.trim()).filter(Boolean) : [],
}));

const BY_WORD = new Map(WORDS.map((w) => [w.word, w]));

export function findWord(word: string): Word | undefined {
  return BY_WORD.get(word);
}

/**
 * Mostly easy and medium. A hard word nobody solves is a round that feels
 * broken, so level 3 comes up about one time in eight.
 */
export function pickWord(exclude: string[] = []): Word {
  const skip = new Set(exclude);
  const roll = Math.random();
  const level: 1 | 2 | 3 = roll < 0.45 ? 1 : roll < 0.875 ? 2 : 3;
  let pool = WORDS.filter((w) => w.level === level && !skip.has(w.word));
  if (pool.length === 0) pool = WORDS.filter((w) => !skip.has(w.word));
  if (pool.length === 0) pool = WORDS;
  return pool[Math.floor(Math.random() * pool.length)];
}
