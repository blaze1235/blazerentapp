const express = require('express');
const { Pool } = require('pg');
const NodeCache = require('node-cache');

const app = express();
const cache = new NodeCache({ stdTTL: 30 });

// Accept both Python asyncpg URLs and plain postgres URLs
const rawUrl = process.env.DATABASE_URL || 'postgresql://steam:steam@db:5432/steamrent';
const pgUrl  = rawUrl.replace(/^postgresql\+asyncpg/, 'postgresql').replace(/^postgres\+asyncpg/, 'postgresql');

const pool = new Pool({
  connectionString: pgUrl,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

app.use(express.static(__dirname));

// ─── Data fetch ───────────────────────────────────────────────────────────────
async function fetchAll() {
  const cached = cache.get('data');
  if (cached) return cached;

  // All queries in parallel — timestamps formatted to Tashkent local time in SQL
  const [
    { rows: orders },
    { rows: users },
    { rows: kicks },
    { rows: promos },
    { rows: accountsRaw },
    { rows: financeRows },
    { rows: clubRows },
  ] = await Promise.all([
    pool.query(`
      SELECT id, user_id, account_id, status, hours,
        price::float, discount::float, paid_amount::float, promo_code,
        TO_CHAR(created_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at
      FROM orders
      ORDER BY created_at
    `),
    pool.query(`
      SELECT id, name, phone, balance::float, tier, is_blocked, is_vip, tg_username,
        TO_CHAR(created_at     AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at,
        TO_CHAR(last_active_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD"T"HH24:MI:SS') AS last_active_at
      FROM users
      ORDER BY created_at
    `),
    pool.query(`
      SELECT order_id, account_id, steam_login, result, reason_code, reason_detail,
        TO_CHAR(ts AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD"T"HH24:MI:SS') AS ts
      FROM kick_log
      ORDER BY ts
    `),
    pool.query(`
      SELECT code, type, value::float, max_uses, used_count, is_paused, note
      FROM promos ORDER BY created_at
    `),
    pool.query(`
      SELECT id, steam_login, status, game, mode,
        price_per_hour, total_orders_sum::float, club_id, note
      FROM steam_accounts
    `),
    pool.query(`
      SELECT type, category, amount::float, note, created_by,
        TO_CHAR(tx_date AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD') AS tx_date
      FROM finance_transactions ORDER BY tx_date
    `),
    pool.query(`
      SELECT c.id, c.name, c.status, c.commission_type, c.commission_value::float,
        COUNT(DISTINCT cc.id)::int AS code_count,
        COALESCE(SUM(cc.scans), 0)::int AS total_scans
      FROM clubs c
      LEFT JOIN club_codes cc ON cc.club_id = c.id
      WHERE c.deleted_at IS NULL
      GROUP BY c.id ORDER BY c.created_at
    `),
  ]);

  const num = v => parseFloat(v) || 0;

  // ── Account name map (id → steam_login) ───────────────────────────────────
  const acctNameMap = {};
  accountsRaw.forEach(a => { acctNameMap[a.id] = a.steam_login; });

  // ── Order status split ─────────────────────────────────────────────────────
  const finished = orders.filter(o => o.status === 'completed');
  const pending  = orders.filter(o => o.status === 'pending_payment');

  // ── Revenue ────────────────────────────────────────────────────────────────
  const totalRevenue        = finished.reduce((s, o) => s + num(o.paid_amount), 0);
  const totalListPrice      = finished.reduce((s, o) => s + num(o.price), 0);
  const totalHours          = finished.reduce((s, o) => s + num(o.hours), 0);
  const totalForgoneRevenue = finished.reduce((s, o) => s + Math.max(0, num(o.price) - num(o.paid_amount)), 0);

  // ── Promo / paid split ────────────────────────────────────────────────────
  const hasPromo         = o => o.promo_code && String(o.promo_code).trim() !== '';
  const promoOrders      = finished.filter(hasPromo);
  const paidOrders       = finished.filter(o => !hasPromo(o));
  const revenueFromPaid  = paidOrders.reduce((s, o) => s + num(o.paid_amount), 0);
  const revenueFromPromo = promoOrders.reduce((s, o) => s + num(o.paid_amount), 0);

  // ── Users ──────────────────────────────────────────────────────────────────
  const validUserIdSet = new Set(users.map(u => u.id));
  const custNameMap    = {};
  users.forEach(u => { custNameMap[u.id] = u.name || u.phone; });

  const activeIds  = new Set(finished.map(o => o.user_id).filter(id => id && validUserIdSet.has(id)));
  const neverOrdered = users.filter(u => !activeIds.has(u.id)).length;

  // ── Per-user stats ─────────────────────────────────────────────────────────
  const custOrders = {}, custRevenue = {}, custHours = {};
  finished.forEach(o => {
    const id = o.user_id;
    if (!id) return;
    custOrders[id]  = (custOrders[id]  || 0) + 1;
    custRevenue[id] = (custRevenue[id] || 0) + num(o.paid_amount);
    custHours[id]   = (custHours[id]   || 0) + num(o.hours);
  });

  const allStats     = Object.keys(custOrders).map(id => ({
    name: custNameMap[id] || id, orders: custOrders[id],
    revenue: custRevenue[id], hours: custHours[id] || 0,
  }));
  const topByOrders  = [...allStats].sort((a, b) => b.orders  - a.orders).slice(0, 10);
  const topByRevenue = [...allStats].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  // ── Monthly breakdown ─────────────────────────────────────────────────────
  // Timestamps are already Tashkent-formatted by SQL — safe to slice directly
  const monthly = {};
  finished.forEach(o => {
    if (!o.created_at || o.created_at.length < 7) return;
    const key = o.created_at.slice(0, 7);
    if (!monthly[key]) monthly[key] = { orders: 0, revenue: 0, hours: 0, promo: 0, paid: 0 };
    monthly[key].orders++;
    monthly[key].revenue += num(o.paid_amount);
    monthly[key].hours   += num(o.hours);
    if (hasPromo(o)) monthly[key].promo++;
    else             monthly[key].paid++;
  });

  const signupsByMonth = {};
  users.forEach(u => {
    if (!u.created_at || u.created_at.length < 7) return;
    const key = u.created_at.slice(0, 7);
    signupsByMonth[key] = (signupsByMonth[key] || 0) + 1;
  });

  const sortedMonths = Object.entries(monthly).sort(([a], [b]) => a.localeCompare(b));
  const nowKey       = (() => {
    const t = new Date(Date.now() + 5 * 3600_000);
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
  })();
  const fullMonths   = sortedMonths.filter(([k]) => k < nowKey);

  const firstRev    = fullMonths.length ? fullMonths[0][1].revenue : 1;
  const lastFullRev = fullMonths.length ? fullMonths[fullMonths.length - 1][1].revenue : 1;
  const peakRev     = fullMonths.length ? Math.max(...fullMonths.map(([, d]) => d.revenue)) : 1;
  const revenueGrowthLastFull = firstRev > 0 ? parseFloat((lastFullRev / firstRev).toFixed(1)) : 0;
  const revenueGrowthPeak     = firstRev > 0 ? parseFloat((peakRev     / firstRev).toFixed(1)) : 0;
  const lastFullMonth         = fullMonths.length ? fullMonths[fullMonths.length - 1][0] : null;
  const forecastBase          = lastFullRev;

  // ── Per-club baseline ─────────────────────────────────────────────────────
  const HIST_CLUBS             = Math.max(1, clubRows.length);
  const fullMonthCount         = fullMonths.length || 1;
  const ordersInFull           = fullMonths.reduce((s, [, d]) => s + d.orders, 0);
  const signupsInFull          = fullMonths.reduce((s, [k]) => s + (signupsByMonth[k] || 0), 0);
  const ordersPerClubPerMonth  = Math.round(ordersInFull  / fullMonthCount / HIST_CLUBS);
  const signupsPerClubPerMonth = Math.round(signupsInFull / fullMonthCount / HIST_CLUBS);

  // ── Account utilization ───────────────────────────────────────────────────
  const acctSessions = {}, acctRevenue = {};
  finished.forEach(o => {
    const a = o.account_id; if (!a) return;
    acctSessions[a] = (acctSessions[a] || 0) + 1;
    acctRevenue[a]  = (acctRevenue[a]  || 0) + num(o.paid_amount);
  });
  const accountStats = Object.entries(acctSessions)
    .map(([id, sessions]) => ({ name: acctNameMap[id] || id, sessions, revenue: acctRevenue[id] || 0 }))
    .sort((a, b) => b.sessions - a.sessions);

  // ── Frequency distribution ────────────────────────────────────────────────
  const freq = { 0: 0, 1: 0, '2-4': 0, '5-9': 0, '10+': 0 };
  users.forEach(u => {
    const n = custOrders[u.id] || 0;
    if      (n === 0) freq[0]++;
    else if (n === 1) freq[1]++;
    else if (n <= 4)  freq['2-4']++;
    else if (n <= 9)  freq['5-9']++;
    else              freq['10+']++;
  });

  // ── Kick reliability ──────────────────────────────────────────────────────
  const kickSuccess  = kicks.filter(k => k.result === 'success').length;
  const kickFail     = kicks.length - kickSuccess;
  const kickByReason = {};
  kicks.filter(k => k.result !== 'success').forEach(k => {
    const r = k.reason_code || 'UNKNOWN';
    kickByReason[r] = (kickByReason[r] || 0) + 1;
  });
  const kickAcctSuccess = {}, kickAcctTotal = {};
  kicks.forEach(k => {
    const a = k.account_id; if (!a) return;
    kickAcctTotal[a] = (kickAcctTotal[a] || 0) + 1;
    if (k.result === 'success') kickAcctSuccess[a] = (kickAcctSuccess[a] || 0) + 1;
  });
  const accountReliability = Object.entries(kickAcctTotal)
    .map(([id, total]) => ({
      name: acctNameMap[id] || id, total,
      success:  kickAcctSuccess[id] || 0,
      failRate: Math.round((1 - (kickAcctSuccess[id] || 0) / total) * 100),
    }))
    .sort((a, b) => b.failRate - a.failRate)
    .slice(0, 10);

  // ── Promo stats ───────────────────────────────────────────────────────────
  const promoStats = promos.map(p => ({
    code:     p.code,
    type:     p.type,
    value:    num(p.value),
    used:     num(p.used_count),
    maxUses:  num(p.max_uses),
    paused:   p.is_paused,
    usagePct: p.max_uses ? Math.round(num(p.used_count) / num(p.max_uses) * 100) : 0,
  }));

  // ── Hour distribution (Tashkent, already formatted) ───────────────────────
  const hourDist = Array(24).fill(0);
  finished.forEach(o => {
    if (!o.created_at || o.created_at.length < 13) return;
    const h = parseInt(o.created_at.slice(11, 13), 10);
    if (!isNaN(h) && h >= 0 && h < 24) hourDist[h]++;
  });
  const peakHour = hourDist.indexOf(Math.max(...hourDist));

  // ── Day-of-week distribution ──────────────────────────────────────────────
  const dowDist = Array(7).fill(0);
  finished.forEach(o => {
    if (!o.created_at || o.created_at.length < 10) return;
    try { dowDist[new Date(o.created_at.slice(0, 10) + 'T12:00:00').getDay()]++; } catch {}
  });
  const peakDow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dowDist.indexOf(Math.max(...dowDist))];

  // ── Projections ───────────────────────────────────────────────────────────
  const nowUtc   = new Date();
  const tash     = new Date(nowUtc.getTime() + 5 * 3600_000);
  const curYear  = tash.getUTCFullYear();
  const curMonth = tash.getUTCMonth();
  const curDay   = tash.getUTCDate();
  const curHour  = tash.getUTCHours();
  const curMonthKey  = `${curYear}-${String(curMonth + 1).padStart(2, '0')}`;
  const daysInMonth  = new Date(Date.UTC(curYear, curMonth + 1, 0)).getUTCDate();
  const daysRemaining = Math.max(0, daysInMonth - curDay);

  const dowTotalAll = dowDist.reduce((a, b) => a + b, 0) || 7;
  const dowWeight   = dowDist.map(x => (x / dowTotalAll) || (1 / 7));
  let elapsedWeight = 0, totalWeight = 0;
  for (let dd = 1; dd <= daysInMonth; dd++) {
    const wd = new Date(Date.UTC(curYear, curMonth, dd, 12)).getUTCDay();
    const w  = dowWeight[wd] || (1 / 7);
    totalWeight += w;
    if (dd < curDay)        elapsedWeight += w;
    else if (dd === curDay) elapsedWeight += w * Math.min(1, curHour / 24);
  }
  const elapsedFrac = totalWeight > 0 ? Math.min(1, elapsedWeight / totalWeight) : Math.min(1, curDay / daysInMonth);

  const cm              = monthly[curMonthKey] || { orders: 0, revenue: 0, hours: 0 };
  const mtdSignups      = signupsByMonth[curMonthKey] || 0;
  const lastFullData    = fullMonths.length ? fullMonths[fullMonths.length - 1][1] : { orders: 0, revenue: 0, hours: 0 };
  const lastFullSignups = lastFullMonth ? (signupsByMonth[lastFullMonth] || 0) : 0;
  const blendW = Math.max(0, Math.min(1, elapsedFrac / 0.5));
  const pctOf  = (proj, base) => base > 0 ? Math.round((proj / base - 1) * 100) : 0;
  const mkProj = (mtd, lastFull) => {
    const runRate   = elapsedFrac > 0 ? mtd / elapsedFrac : lastFull;
    const projected = elapsedFrac < 0.02
      ? Math.round(lastFull)
      : Math.round(runRate * blendW + lastFull * (1 - blendW));
    return { mtd: Math.round(mtd), projected, runRate: Math.round(runRate), lastFull: Math.round(lastFull), vsLastFullPct: pctOf(projected, lastFull) };
  };

  const dailyOrders = Array(daysInMonth).fill(0), dailyRevenue = Array(daysInMonth).fill(0);
  finished.forEach(o => {
    if (!o.created_at || o.created_at.slice(0, 7) !== curMonthKey) return;
    const d = parseInt(o.created_at.slice(8, 10), 10);
    if (d >= 1 && d <= daysInMonth) { dailyOrders[d - 1]++; dailyRevenue[d - 1] += num(o.paid_amount); }
  });
  let cumO = 0, cumR = 0;
  const cumOrders  = dailyOrders.map(v => (cumO += v));
  const cumRevenue = dailyRevenue.map(v => (cumR += v));

  const projections = {
    monthKey: curMonthKey, daysInMonth, dayOfMonth: curDay, daysElapsed: curDay,
    daysRemaining, elapsedFrac: parseFloat(elapsedFrac.toFixed(3)),
    confidence: Math.round(Math.min(1, elapsedFrac) * 100), lastFullMonth,
    orders:  mkProj(cm.orders,  lastFullData.orders),
    revenue: mkProj(cm.revenue, lastFullData.revenue),
    hours:   mkProj(cm.hours,   lastFullData.hours),
    signups: mkProj(mtdSignups, lastFullSignups),
    daily: { cumOrders, cumRevenue, actualDays: curDay },
  };

  // ── Calc defaults (Forecast Builder seed) ────────────────────────────────
  const distinctAccounts   = accountsRaw.length || 1;
  const avgSessionHours    = finished.length ? totalHours / finished.length : 1.5;
  const revenuePerHour     = totalHours > 0 ? totalRevenue / totalHours : 0;
  const sessionsPerAcctDay = ordersInFull / fullMonthCount / Math.max(1, distinctAccounts) / 30;
  const calc = {
    accounts:                 distinctAccounts,
    clubs:                    HIST_CLUBS,
    pricePerHour:             Math.round(revenuePerHour),
    avgSessionHours:          parseFloat(avgSessionHours.toFixed(2)),
    sessionsPerAccountPerDay: parseFloat(Math.max(0.1, sessionsPerAcctDay).toFixed(2)),
    ordersPerClubPerMonth,
    operatingDays:            30,
    avgPricePerOrder:         Math.round(finished.length ? totalRevenue / finished.length : 0),
    promoRate:                parseFloat((finished.length ? promoOrders.length / finished.length : 0).toFixed(2)),
  };

  const result = {
    fetchedAt: new Date().toISOString(),
    summary: {
      totalOrders:       finished.length,
      pendingOrders:     pending.length,
      activeOrders:      orders.filter(o => o.status === 'active').length,
      totalRevenue, totalListPrice, totalForgoneRevenue, totalHours,
      totalCustomers:    users.length,
      activeCustomers:   activeIds.size,
      neverOrdered,
      avgOrderValue:     finished.length ? totalRevenue / finished.length : 0,
      promoOrders:       promoOrders.length,
      paidOrders:        paidOrders.length,
      promoRate:         finished.length ? promoOrders.length / finished.length : 0,
      activationRate:    users.length ? activeIds.size / users.length : 0,
      paidOrderAvg:      paidOrders.length  ? revenueFromPaid  / paidOrders.length  : 0,
      promoOrderAvg:     promoOrders.length ? revenueFromPromo / promoOrders.length : 0,
      revenueFromPaid, revenueFromPromo,
      revenueGrowth:     revenueGrowthLastFull,
      revenueGrowthPeak,
      lastFullMonth, forecastBase, peakHour, peakDow,
      ordersPerClubPerMonth, signupsPerClubPerMonth,
    },
    monthly:     sortedMonths.map(([month, d]) => ({ month, ...d })),
    signups:     Object.entries(signupsByMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count })),
    topByOrders, topByRevenue,
    accounts: accountStats,
    reliability: accountReliability,
    freqBuckets: [
      { label: 'Never ordered', value: freq[0]     },
      { label: '1 order',       value: freq[1]     },
      { label: '2–4 orders',    value: freq['2-4'] },
      { label: '5–9 orders',    value: freq['5-9'] },
      { label: '10+ orders',    value: freq['10+'] },
    ],
    promoStats,
    kickStats: {
      total: kicks.length, success: kickSuccess, fail: kickFail,
      successRate: kicks.length ? Math.round(kickSuccess / kicks.length * 100) : 0,
      byReason: kickByReason,
    },
    hourDist, dowDist, projections, calc,
    // ── New data not available from Sheets ───────────────────────────────────
    finance: financeRows,
    clubs: clubRows,
  };

  cache.set('data', result);
  return result;
}

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/api/data', async (req, res) => {
  try { res.json(await fetchAll()); }
  catch (e) { console.error('[/api/data]', e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/refresh', (req, res) => { cache.flushAll(); res.json({ ok: true }); });

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`BlazeRent Admin → http://localhost:${PORT}`));
