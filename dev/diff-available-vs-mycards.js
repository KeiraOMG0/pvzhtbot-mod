// dev/diff-available-vs-mycards.js
// Paste into the browser console on any pvzhtbot.com page while logged in.
// Read-only. Cross-references available/ (swept across every side/class),
// user-cards/ (owned), and cardinfo/ (all cards) to independently verify
// the Completion Tracker's math without touching the userscript's own code.

(async () => {
  const BASE = 'https://api.pvzhtbot.com/tbotapp';
  const getJson = async (path) => (await fetch(`${BASE}${path}`, { credentials: 'include' })).json();

  const mine = await getJson('/user-cards/');
  const info = await getJson('/cardinfo/');
  const ownedNames = new Set(mine.cards.map((c) => c.card_name));
  const ownedQty = new Map(mine.cards.map((c) => [c.card_name, c.quantity]));

  const isNonCollectible = (c) =>
    c.set_rarity === 'Premium - Hero' || c.set_rarity === 'Token' || (c.description || '').includes('Superpower');

  const normalCards = info.filter((c) => !isNonCollectible(c));
  const normalOwned = normalCards.filter((c) => ownedNames.has(c.card_name));
  const normalMissing = normalCards.filter((c) => !ownedNames.has(c.card_name));
  const normalUnderPlayset = normalOwned.filter((c) => (ownedQty.get(c.card_name) || 0) < 4);
  const normalFullPlayset = normalOwned.filter((c) => (ownedQty.get(c.card_name) || 0) >= 4);

  console.log('--- cardinfo/ vs user-cards/ cross-check ---');
  console.log(`Total cards in game (cardinfo/): ${info.length}`);
  console.log(`Non-collectible (hero/token/superpower): ${info.length - normalCards.length}`);
  console.log(`Normal collectible cards: ${normalCards.length}`);
  console.log(`  owned (>=1 copy): ${normalOwned.length}`);
  console.log(`  missing (0 copies): ${normalMissing.length}`);
  console.log(`  full 4x playset: ${normalFullPlayset.length}`);
  console.log(`  under 4x playset: ${normalUnderPlayset.length}`);
  if (normalMissing.length) console.log('Missing card names:', normalMissing.map((c) => c.card_name));
  if (normalUnderPlayset.length) {
    console.log(
      'Under-playset cards:',
      normalUnderPlayset.map((c) => `${c.card_name} (${ownedQty.get(c.card_name)}/4)`)
    );
  }

  // Cross-check against available/ directly: sweep every side/class and
  // confirm every entry it returns matches our own under-4x/missing math.
  console.log('--- available/ live sweep ---');
  const sides = ['Plants', 'Zombie'];
  let sweepTotal = 0;
  let mismatches = 0;
  for (const side of sides) {
    const { classes } = await getJson(`/user-cards/classes/?side=${side}`);
    for (const cls of classes) {
      const avail = await getJson(`/user-cards/available/?side=${side}&class=${cls}`);
      for (const card of avail.cards || []) {
        sweepTotal += 1;
        const expectedQty = ownedQty.get(card.card_name) || 0;
        if (card.owned_quantity !== expectedQty) {
          mismatches += 1;
          console.log(
            `MISMATCH: ${card.card_name} — available/ says owned_quantity=${card.owned_quantity}, user-cards/ says ${expectedQty}`
          );
        }
      }
    }
  }
  console.log(`available/ returned ${sweepTotal} cards total across all side/class combos, ${mismatches} mismatches vs user-cards/`);
  console.log('--- done ---');
})();
