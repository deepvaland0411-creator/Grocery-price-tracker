const { connectDb } = require("./db");
const Category = require("./models/category.model");
const Product = require("./models/product.model");
const Store = require("./models/store.model");
const ProductStorePrice = require("./models/productStorePrice.model");
const { categories, products, stores } = require("./seed-data");

async function runSeed() {
  await connectDb();
  await Promise.all([
    Category.deleteMany({}),
    Product.deleteMany({}),
    Store.deleteMany({}),
    ProductStorePrice.deleteMany({}),
  ]);

  const insertedCategories = await Category.insertMany(categories);
  const categoryMap = new Map(insertedCategories.map((c) => [c.slug, c._id]));

  const mappedProducts = products.map((p) => ({
    ...p,
    category: categoryMap.get(p.category),
  }));

  const insertedProducts = await Product.insertMany(mappedProducts);
  const insertedStores = await Store.insertMany(stores);

  const storeIds = insertedStores.map((s) => s._id);
  const priceRows = [];
  for (const p of insertedProducts) {
    const base = Number(p.price) || 0;
    storeIds.forEach((sid, i) => {
      priceRows.push({
        product: p._id,
        store: sid,
        price: Math.max(0, Math.round(base * (0.9 + (i % 20) * 0.01))),
      });
    });
  }
  if (priceRows.length) await ProductStorePrice.insertMany(priceRows);

  console.log("Seed completed successfully.");
  process.exit(0);
}

runSeed().catch((error) => {
  console.error("Seed failed:", error.message);
  process.exit(1);
});
