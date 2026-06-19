/** FNV-1a hash for deterministic per-product randomness. */
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Per-product store prices with a random cheapest store and shuffled rank order.
 * Each product gets a different store ordering so no single store wins every category.
 */
function computeStorePricesForProduct(basePrice, storeCount, productKey) {
  const rand = seededRandom(hashSeed(String(productKey)));
  const base = Math.max(1, Math.round(Number(basePrice) || 0));
  const count = Math.max(1, storeCount);

  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const prices = new Array(count);
  let current = Math.max(1, Math.round(base * (0.86 + rand() * 0.1)));
  prices[order[0]] = current;

  for (let rank = 1; rank < count; rank++) {
    current += 2 + Math.floor(rand() * 4);
    if (rank > count * 0.55 && rand() > 0.45) {
      current += 1 + Math.floor(rand() * 6);
    }
    prices[order[rank]] = current;
  }

  return prices;
}

/** @deprecated Use computeStorePricesForProduct — kept for older callers. */
function computeStorePrice(basePrice, storeIndex) {
  const prices = computeStorePricesForProduct(basePrice, storeIndex + 1, "legacy-" + storeIndex);
  return prices[storeIndex];
}

/** Generate daily price history ending at endPrice (365 days by default). */
function generateDailyHistory(endPrice, days, storeIndex) {
  const records = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startOffset = 4 + (storeIndex % 6);
  let price = Math.max(1, endPrice - startOffset);

  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(today);
    date.setDate(today.getDate() - d);

    if (d === 0) {
      price = endPrice;
    } else {
      const drift = (endPrice - price) * 0.04;
      const noise = Math.sin(d * 0.45 + storeIndex * 1.3) * 1.2;
      price = Math.max(1, Math.round(price + drift + noise));
    }

    records.push({ price, recordedAt: date });
  }

  return records;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n) {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() - n);
  return d;
}

module.exports = {
  hashSeed,
  seededRandom,
  computeStorePricesForProduct,
  computeStorePrice,
  generateDailyHistory,
  startOfDay,
  daysAgo,
};
