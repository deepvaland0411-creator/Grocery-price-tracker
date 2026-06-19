const { connectDb } = require("./db");
const Product = require("./models/product.model");
const Store = require("./models/store.model");
const ProductStorePrice = require("./models/productStorePrice.model");
const PriceHistory = require("./models/priceHistory.model");
const {
  computeStorePricesForProduct,
  startOfDay,
  daysAgo,
} = require("./priceHistoryUtil");

async function run() {
  await connectDb();

  const stores = await Store.find({ status: "active" }).sort({ name: 1 }).lean();
  if (!stores.length) {
    console.log("No active stores found.");
    process.exit(0);
  }

  const storeIds = stores.map((s) => s._id);
  const products = await Product.find({ status: "active" }).lean();
  const yesterday = daysAgo(1);
  const today = startOfDay(new Date());

  let priceRows = 0;
  let changedRows = 0;
  let upCount = 0;
  let downCount = 0;

  for (const product of products) {
    const base = Number(product.price) || 0;
    const newPrices = computeStorePricesForProduct(base, storeIds.length, String(product._id));
    const existing = await ProductStorePrice.find({ product: product._id }).lean();
    const oldByStore = new Map(existing.map((r) => [String(r.store), r.price]));

    for (let i = 0; i < storeIds.length; i++) {
      const storeId = storeIds[i];
      const newPrice = newPrices[i];
      const oldPrice = oldByStore.get(String(storeId));

      if (oldPrice !== undefined && oldPrice !== newPrice) {
        await PriceHistory.findOneAndUpdate(
          { product: product._id, store: storeId, recordedAt: yesterday },
          { price: oldPrice },
          { upsert: true }
        );
        changedRows += 1;
        if (newPrice > oldPrice) upCount += 1;
        else downCount += 1;
      } else if (oldPrice === undefined) {
        await PriceHistory.findOneAndUpdate(
          { product: product._id, store: storeId, recordedAt: yesterday },
          { price: Math.max(1, newPrice - (2 + (i % 3))) },
          { upsert: true }
        );
        changedRows += 1;
        upCount += 1;
      }

      await PriceHistory.findOneAndUpdate(
        { product: product._id, store: storeId, recordedAt: today },
        { price: newPrice },
        { upsert: true }
      );

      await ProductStorePrice.findOneAndUpdate(
        { product: product._id, store: storeId },
        { price: newPrice, updatedAt: new Date() },
        { upsert: true }
      );
      priceRows += 1;
    }
  }

  console.log("Price refresh completed.");
  console.log("  Products:       " + products.length);
  console.log("  Stores:         " + storeIds.length);
  console.log("  Price rows:     " + priceRows);
  console.log("  Changed rows:   " + changedRows);
  console.log("  Price increases:" + upCount);
  console.log("  Price decreases:" + downCount);
  process.exit(0);
}

run().catch(function (error) {
  console.error("Update failed:", error.message);
  process.exit(1);
});
