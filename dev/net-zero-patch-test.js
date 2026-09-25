// dev/net-zero-patch-test.js
// Paste into the browser console on any pvzhtbot.com page while logged in.
// NOT read-only: does a real PATCH, then immediately reverts it. Confirms
// the update-quantity endpoint's request/response shape still matches
// site-research/docs/cards.md, leaving your collection exactly as it was.
//
// Edit CARD_ID below to a user-card id you own (the `id` field from a
// user-cards/ entry, not the game's cardid) currently at quantity 4 — or
// change ORIGINAL_QTY/TEST_QTY to match whatever it's actually at.

const CARD_ID = 8095; // "2nd-Best Taco of All Time" on the original test account
const ORIGINAL_QTY = 4;
const TEST_QTY = 3;

(async () => {
  const BASE = 'https://api.pvzhtbot.com/tbotapp';

  const { csrfToken } = await (await fetch(`${BASE}/csrf/`, { credentials: 'include' })).json();

  const patch = async (quantity) => {
    const res = await fetch(`${BASE}/user-cards/${CARD_ID}/`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
      body: JSON.stringify({ quantity }),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  console.log(`--- PATCHing user-card ${CARD_ID} down to ${TEST_QTY} ---`);
  const down = await patch(TEST_QTY);
  console.log(down);

  console.log(`--- PATCHing user-card ${CARD_ID} back up to ${ORIGINAL_QTY} ---`);
  const up = await patch(ORIGINAL_QTY);
  console.log(up);

  if (up.body?.quantity !== ORIGINAL_QTY) {
    console.warn('WARNING: card was NOT restored to original quantity — check manually via the site UI.');
  } else {
    console.log('Restored successfully. Net-zero confirmed.');
  }
})();
