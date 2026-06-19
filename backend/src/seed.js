const { connectDb } = require("./db");
const Category = require("./models/category.model");
const Product = require("./models/product.model");
const Store = require("./models/store.model");
const ProductStorePrice = require("./models/productStorePrice.model");
const PriceHistory = require("./models/priceHistory.model");
const { categories, products, stores } = require("./seed-data");
const { computeStorePricesForProduct, generateDailyHistory } = require("./priceHistoryUtil");

const HISTORY_DAYS = 365;
const BATCH_SIZE = 3000;

async function runSeed() {
  await connectDb();
  console.log("Clearing existing catalog data...");
  await Promise.all([
    Category.deleteMany({}),
    Product.deleteMany({}),
    Store.deleteMany({}),
    ProductStorePrice.deleteMany({}),
    PriceHistory.deleteMany({}),
  ]);

  console.log("Inserting categories...");
  const insertedCategories = await Category.insertMany(categories);
  const categoryMap = new Map(insertedCategories.map((c) => [c.slug, c._id]));

  console.log("Inserting products...");
  const mappedProducts = products.map((p) => ({
    ...p,
    category: categoryMap.get(p.category),
  }));
  const insertedProducts = await Product.insertMany(mappedProducts);

  console.log("Inserting stores...");
  const insertedStores = await Store.insertMany(stores);
  const activeStores = insertedStores.filter((s) => s.status === "active");

  console.log("Building store prices (random cheapest store per product)...");
  const priceRows = [];
  for (const p of insertedProducts) {
    const base = Number(p.price) || 0;
    const storePrices = computeStorePricesForProduct(base, activeStores.length, String(p._id));
    activeStores.forEach((store, i) => {
      priceRows.push({
        product: p._id,
        store: store._id,
        price: storePrices[i],
      });
    });
  }
  if (priceRows.length) await ProductStorePrice.insertMany(priceRows);

  console.log("Generating " + HISTORY_DAYS + " days of price history...");
  const historyRows = [];
  for (const p of insertedProducts) {
    const base = Number(p.price) || 0;
    const storePrices = computeStorePricesForProduct(base, activeStores.length, String(p._id));
    activeStores.forEach((store, i) => {
      const currentPrice = storePrices[i];
      const daily = generateDailyHistory(currentPrice, HISTORY_DAYS, i);
      daily.forEach((row) => {
        historyRows.push({
          product: p._id,
          store: store._id,
          price: row.price,
          recordedAt: row.recordedAt,
        });
      });
    });
  }

  for (let i = 0; i < historyRows.length; i += BATCH_SIZE) {
    await PriceHistory.insertMany(historyRows.slice(i, i + BATCH_SIZE));
    process.stdout.write("\r  " + Math.min(i + BATCH_SIZE, historyRows.length) + " / " + historyRows.length);
  }
  console.log("\n");

  console.log("Seed completed successfully.");
  console.log("  Categories: " + insertedCategories.length);
  console.log("  Products:   " + insertedProducts.length);
  console.log("  Stores:     " + insertedStores.length + " (" + activeStores.length + " active)");
  console.log("  Prices:     " + priceRows.length);
  console.log("  History:    " + historyRows.length + " records");
  process.exit(0);
}

runSeed().catch((error) => {
  console.error("Seed failed:", error.message);
  process.exit(1);
});
