(async () => {
    const API = "https://api.pvzhtbot.com/tbotapp";
    const QUANTITY = 4, BATCH_SIZE = 50, BATCH_DELAY = 250, GET_CONCURRENCY = 4;

    const q = encodeURIComponent;
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const toArray = x =>
        Array.isArray(x) ? x :
        Array.isArray(x?.cards) ? x.cards :
        Array.isArray(x?.results) ? x.results :
        Array.isArray(x?.classes) ? x.classes :
        Array.isArray(x?.data) ? x.data :
        (() => { throw new Error(`Unexpected shape: ${JSON.stringify(x).slice(0, 300)}`); })();

    // Fail loudly on a dropped session instead of silently enumerating nothing
    const unwrap = (x, label) => {
        if (x?.authenticated === false) throw new Error(`Not authenticated (${label}) — log in and rerun.`);
        return toArray(x);
    };

    const get = async path => {
        const r = await fetch(`${API}${path}`, {
            credentials: "include",
            headers: { Accept: "application/json" }
        });
        if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
        return r.json();
    };

    // Bounded parallelism: workers pull from a shared cursor, results keep input order
    const mapLimit = async (items, limit, fn) => {
        const out = new Array(items.length);
        let i = 0;
        await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (i < items.length) {
                const n = i++;
                out[n] = await fn(items[n]);
            }
        }));
        return out;
    };

    console.clear();
    console.log("🌱 Starting card collection...");

    // Classes for both sides + CSRF, in parallel
    const [classLists, csrfData] = await Promise.all([
        mapLimit(["Plants", "Zombie"], 2, async side => {
            const raw = unwrap(await get(`/user-cards/classes/?side=${q(side)}`), `classes/${side}`);
            return raw.map(c => [side, typeof c === "string" ? c : (c.name ?? c.class ?? c.card_class)]);
        }),
        get("/csrf/")
    ]);

    const csrfToken = csrfData.csrfToken ?? csrfData.csrf_token ?? csrfData.token;
    if (!csrfToken) {
        console.error("CSRF response:", csrfData);
        throw new Error("Could not find CSRF token.");
    }

    const pairs = classLists.flat();
    console.log(`Discovered ${pairs.length} side/class combinations.`);

    const cardLists = await mapLimit(pairs, GET_CONCURRENCY, ([side, cls]) =>
        get(`/user-cards/available/?side=${q(side)}&class=${q(cls)}`)
            .then(x => unwrap(x, `available/${side}/${cls}`))
    );

    const available = new Set(cardLists.flat().map(c => c.card_name));
    const owned = new Set(unwrap(await get("/user-cards/"), "user-cards").map(c => c.card_name));

    const missing = [...available].filter(n => !owned.has(n));

    console.log(`Available: ${available.size} | Owned: ${owned.size} | ` +
                `To add: ${missing.length} (${missing.length * QUANTITY} copies)`);

    if (!missing.length) return console.log("✓ Collection is already complete.");

    const post = async cards => {
        const r = await fetch(`${API}/user-cards/create/`, {
            method: "POST",
            credentials: "include",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "X-CSRFToken": csrfToken
            },
            body: JSON.stringify({ cards })
        });
        return { ok: r.ok, status: r.status, body: r.ok ? null : await r.text() };
    };

    const total = Math.ceil(missing.length / BATCH_SIZE);
    let added = 0;

    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
        const n = i / BATCH_SIZE + 1;
        let batch = missing.slice(i, i + BATCH_SIZE)
            .filter(name => !owned.has(name))
            .map(card_name => ({ card_name, quantity: QUANTITY }));

        if (!batch.length) { console.log(`⏭  Batch ${n}/${total} — nothing left to add`); continue; }

        console.log(`📦 Batch ${n}/${total} — adding ${batch.length}...`);
        let res = await post(batch);

        // 409 → server names the conflicts; subtract them and retry once
        if (res.status === 409) {
            let conflicts = [];
            try { conflicts = (JSON.parse(res.body).already_owned ?? []).map(c => c.card_name); }
            catch { /* non-JSON 409 — fall through to the throw below */ }

            if (conflicts.length) {
                console.warn(`⚠️  Batch ${n}: ${conflicts.length} already owned, retrying without them`);
                conflicts.forEach(c => owned.add(c));
                batch = batch.filter(c => !owned.has(c.card_name));
                if (!batch.length) { console.log(`⏭  Batch ${n}/${total} — all already owned`); continue; }
                res = await post(batch);
            }
        }

        if (!res.ok) {
            console.error(`❌ Batch ${n} failed (${res.status}):`, res.body);
            console.error(`Added ${added} cards before failing. Rerun to resume.`);
            throw new Error(`Batch ${n} failed with HTTP ${res.status}`);
        }

        batch.forEach(c => owned.add(c.card_name));
        added += batch.length;
        console.log(`✓ Batch ${n}/${total} complete (${added}/${missing.length})`);

        if (i + BATCH_SIZE < missing.length) await sleep(BATCH_DELAY);
    }

    console.log(`🎉 Done — ${added} cards, ${added * QUANTITY} copies. Refreshing...`);
    await sleep(1000);
    location.reload();
})();