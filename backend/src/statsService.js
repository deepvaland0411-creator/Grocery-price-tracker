const Category = require("./models/category.model");
const Product = require("./models/product.model");
const Store = require("./models/store.model");
const ProductStorePrice = require("./models/productStorePrice.model");
const ContactMessage = require("./models/contactMessage.model");

async function computePlatformStats() {
  const [
    productCount,
    storeCount,
    categoryCount,
    messageCount,
    priceRows,
    uniqueEmails,
  ] = await Promise.all([
    Product.countDocuments({ status: "active" }),
    Store.countDocuments({ status: "active" }),
    Category.countDocuments({ status: "active" }),
    ContactMessage.countDocuments(),
    ProductStorePrice.find()
      .populate({ path: "product", select: "status" })
      .populate({ path: "store", select: "status" })
      .lean(),
    ContactMessage.distinct("email"),
  ]);

  const byProduct = new Map();
  let priceComparisons = 0;

  for (const row of priceRows) {
    if (!row.product || row.product.status !== "active") continue;
    if (!row.store || row.store.status !== "active") continue;
    priceComparisons += 1;
    const pid = String(row.product._id);
    if (!byProduct.has(pid)) byProduct.set(pid, []);
    byProduct.get(pid).push(row.price);
  }

  let totalSavingsInr = 0;
  for (const prices of byProduct.values()) {
    if (prices.length < 2) continue;
    totalSavingsInr += Math.max(...prices) - Math.min(...prices);
  }

  return {
    productCount,
    storeCount,
    categoryCount,
    messageCount,
    happyUsers: uniqueEmails.length,
    priceComparisons,
    totalSavingsInr,
  };
}

module.exports = { computePlatformStats };
