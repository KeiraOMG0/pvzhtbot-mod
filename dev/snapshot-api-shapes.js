// dev/snapshot-api-shapes.js
// Paste into the browser console on any pvzhtbot.com page while logged in.
// Read-only. Hits every confirmed endpoint once and prints a compact
// summary of each response's shape, so a site-side change can be spotted
// in seconds by comparing this output against site-research/docs/.

(async () => {
  const BASE = 'https://api.pvzhtbot.com/tbotapp';
  const get = async (path) => {
    const res = await fetch(`${BASE}${path}`, { credentials: 'include' });
    let body;
    try { body = await res.json(); } catch { body = '<non-JSON body>'; }
    return { status: res.status, body };
  };

  const shapeOf = (body) => {
    if (Array.isArray(body)) return `array[${body.length}]`;
    if (body && typeof body === 'object') return `object{${Object.keys(body).join(',')}}`;
    return typeof body;
  };

  const endpoints = [
    '/profile/me/',
    '/user-cards/',
    '/user-cards/classes/?side=Plants',
    '/user-cards/classes/?side=Zombie',
    '/cardinfo/',
    '/card-count/',
    '/decklists/',
    '/decklist-count/',
    '/heroinfo/',
    '/profiles/',
    '/profiles/count/',
    '/user-decks/',
  ];

  console.log('--- pvzhtbot.com API shape snapshot ---');
  for (const path of endpoints) {
    try {
      const { status, body } = await get(path);
      console.log(`${status} ${path}\n  shape: ${shapeOf(body)}`);
      const arr = Array.isArray(body) ? body : body?.cards || body?.results || body?.decks || body?.profiles;
      if (Array.isArray(arr) && arr.length) {
        console.log(`  sample[0]:`, arr[0]);
      }
    } catch (err) {
      console.log(`ERROR ${path}: ${err.message}`);
    }
  }

  // available/ needs a real side+class; use whatever this account's
  // first class actually is instead of hardcoding one that might not exist.
  try {
    const { body: classesBody } = await get('/user-cards/classes/?side=Plants');
    const firstClass = classesBody.classes?.[0];
    if (firstClass) {
      const { status, body } = await get(`/user-cards/available/?side=Plants&class=${firstClass}`);
      console.log(`${status} /user-cards/available/?side=Plants&class=${firstClass}\n  shape: ${shapeOf(body)}`);
      if (body?.cards?.length) console.log('  sample[0]:', body.cards[0]);
      else console.log('  (0 cards returned for this combo - try a different class if you need a sample)');
    }
  } catch (err) {
    console.log(`ERROR available/: ${err.message}`);
  }

  console.log('--- done ---');
})();
