// DAPUR SENJA — config: recipes, stations, palette, tuning.
// Original warung-kitchen rush game. One distinctive mechanic drives it:
// the chop meter — every chop is a timed hit in the green zone, and perfect
// chops raise the dish's quality star, which raises the tip.
export const VIEW = { width: 1280, height: 720 };
export const DAY_SECONDS = 180;
export const RUSH_AT = 135; // last 45 s: the Senja Rush
export const MAX_HANDS = 2;

export const PALETTE = {
  floor: '#3a2b3f',
  floorAlt: '#41304a',
  wall: '#241a2e',
  board: '#1c1424',
  cream: '#fff3d6',
  gold: '#ffb347',
  ember: '#ff6b4a',
  teal: '#3ec6a7',
  leaf: '#7bc96f',
  red: '#ff5d5d',
  panel: '#2b1f33',
  panelEdge: '#5b4368',
};

export const ITEMS = {
  nasi: { name: 'Nasi', color: '#fff3d6', chop: false, cook: true, cookTime: 5 },
  mie: { name: 'Mie', color: '#ffd166', chop: false, cook: true, cookTime: 4 },
  ayam: { name: 'Ayam', color: '#ff9f7a', chop: true, cook: true, cookTime: 7 },
  telur: { name: 'Telur', color: '#ffe9a8', chop: false, cook: true, cookTime: 3 },
  sayur: { name: 'Sayur', color: '#7bc96f', chop: true, cook: false, cookTime: 0 },
  cabai: { name: 'Cabai', color: '#ff5d5d', chop: true, cook: false, cookTime: 0 },
};

export const RECIPES = [
  {
    id: 'nasi-goreng',
    name: 'Nasi Goreng Senja',
    needs: ['nasi:cooked', 'telur:cooked', 'cabai:chopped'],
    base: 45,
    color: '#ffb347',
  },
  {
    id: 'ayam-geprek',
    name: 'Ayam Geprek Senja',
    needs: ['ayam:cooked', 'cabai:chopped'],
    base: 40,
    color: '#ff6b4a',
  },
  {
    id: 'mie-senja',
    name: 'Mie Senja',
    needs: ['mie:cooked', 'telur:cooked', 'sayur:chopped'],
    base: 45,
    color: '#ffd166',
  },
  {
    id: 'nasi-ayam',
    name: 'Nasi Ayam Senja',
    needs: ['nasi:cooked', 'ayam:cooked'],
    base: 40,
    color: '#fff3d6',
  },
];

// Kitchen stations. x/y/w/h in canvas pixels; label is drawn on the counter.
export const STATIONS = {
  bins: [
    { kind: 'nasi', x: 24, y: 150, w: 132, h: 62 },
    { kind: 'mie', x: 24, y: 224, w: 132, h: 62 },
    { kind: 'ayam', x: 24, y: 298, w: 132, h: 62 },
    { kind: 'telur', x: 24, y: 372, w: 132, h: 62 },
    { kind: 'sayur', x: 24, y: 446, w: 132, h: 62 },
    { kind: 'cabai', x: 24, y: 520, w: 132, h: 62 },
  ],
  board: { x: 300, y: 300, w: 190, h: 110 },
  stove: { x: 560, y: 150, w: 260, h: 120 },
  burners: [
    { x: 590, y: 180, w: 90, h: 64 },
    { x: 700, y: 180, w: 90, h: 64 },
  ],
  plate: { x: 880, y: 300, w: 300, h: 130 },
  window: { x: 880, y: 560, w: 300, h: 120 },
  trash: { x: 300, y: 560, w: 150, h: 80 },
};

export const CHEF = { speed: 300, radius: 20, startX: 620, startY: 480 };
export const INTERACT_RANGE = 86;
export const CHOP_HITS = 3; // timed hits per chop
export const ORDER_PATIENCE = 78;
export const ORDER_PATIENCE_RUSH = 58;
export const ORDER_FIRST_AT = 2;
export const ORDER_EVERY = 15;
export const ORDER_EVERY_RUSH = 11;

export function recipeNeeds(recipe) {
  return recipe.needs.map((n) => {
    const [kind, state] = n.split(':');
    return { kind, state };
  });
}
