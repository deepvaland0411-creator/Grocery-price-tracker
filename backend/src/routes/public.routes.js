const express = require("express");
const Category = require("../models/category.model");
const Product = require("../models/product.model");
const Store = require("../models/store.model");
const ProductStorePrice = require("../models/productStorePrice.model");
const PriceHistory = require("../models/priceHistory.model");
const ContactMessage = require("../models/contactMessage.model");
const { daysAgo } = require("../priceHistoryUtil");

const router = express.Router();

const SUBJECT_KEYS = new Set(["general", "support", "feedback", "partnership", "other"]);

router.post("/contact-messages", async (req, res, next) => {
  try {
    const firstName = String(req.body.firstName || "").trim();
    const lastName = String(req.body.lastName || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const subject = String(req.body.subject || "").trim();
    const message = String(req.body.message || "").trim();

    if (!firstName || !lastName) {
      return res.status(400).json({ message: "First and last name are required" });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Valid email is required" });
    }
    if (!SUBJECT_KEYS.has(subject)) {
      return res.status(400).json({ message: "Please select a valid subject" });
    }
    if (!message || message.length < 3) {
      return res.status(400).json({ message: "Please enter a message (at least a few characters)" });
    }

    const created = await ContactMessage.create({
      firstName,
      lastName,
      email,
      subject,
      message,
      status: "new",
      read: false,
    });
    res.status(201).json({ ok: true, id: created._id });
  } catch (error) {
    next(error);
  }
});

router.get("/categories", async (_req, res, next) => {
  try {
    const categories = await Category.find({ status: "active" }).sort({ name: 1 });
    const categoryIds = categories.map((c) => c._id);
    const counts = await Product.aggregate([
      { $match: { category: { $in: categoryIds }, status: "active" } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((item) => [String(item._id), item.count]));
    const items = categories.map((c) => ({
      ...c.toObject(),
      productCount: countMap.get(String(c._id)) || 0,
    }));
    res.json(items);
  } catch (error) {
    next(error);
  }
});

router.get("/products", async (req, res, next) => {
  try {
    const { category } = req.query;
    const filter = { status: "active" };
    if (category) {
      const cats = await Category.find({
        $or: [{ slug: category }, { name: category }],
      }).select("_id");
      filter.category = { $in: cats.map((c) => c._id) };
    }
    const products = await Product.find(filter).populate("category").sort({ name: 1 });
    res.json(products);
  } catch (error) {
    next(error);
  }
});

router.get("/products/:id/store-prices", async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id).populate("category");
    if (!product || product.status !== "active") {
      return res.status(404).json({ message: "Product not found" });
    }
    const rows = await ProductStorePrice.find({ product: product._id })
      .populate("store")
      .lean();
    const prices = rows
      .filter((r) => r.store && r.store.status === "active")
      .map((r) => ({
        storeId: r.store._id,
        storeName: r.store.name,
        price: r.price,
      }))
      .sort((a, b) => a.price - b.price);
    res.json({
      productId: product._id,
      name: product.name,
      basePrice: product.price,
      image: product.image,
      categoryName: product.category ? product.category.name : "",
      prices,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/stores", async (_req, res, next) => {
  try {
    const stores = await Store.find({ status: "active" }).sort({ name: 1 });
    res.json(stores);
  } catch (error) {
    next(error);
  }
});

function formatHistoryDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function sampleHistoryRows(rows, maxPoints) {
  if (rows.length <= maxPoints) return rows;
  const step = Math.ceil(rows.length / maxPoints);
  const sampled = rows.filter((_, i) => i % step === 0 || i === rows.length - 1);
  return sampled;
}

router.get("/products/:id/price-history", async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const product = await Product.findById(req.params.id).populate("category");
    if (!product || product.status !== "active") {
      return res.status(404).json({ message: "Product not found" });
    }

    const since = daysAgo(days - 1);
    const rows = await PriceHistory.find({
      product: product._id,
      recordedAt: { $gte: since },
    })
      .populate("store", "name status")
      .sort({ recordedAt: 1 })
      .lean();

    const byStore = new Map();
    rows.forEach((r) => {
      if (!r.store || r.store.status !== "active") return;
      const key = String(r.store._id);
      if (!byStore.has(key)) {
        byStore.set(key, {
          storeId: r.store._id,
          storeName: r.store.name,
          series: [],
        });
      }
      byStore.get(key).series.push({
        date: formatHistoryDate(r.recordedAt),
        price: r.price,
      });
    });

    const maxPoints = days <= 7 ? 7 : days <= 30 ? 15 : days <= 90 ? 30 : 52;
    const stores = Array.from(byStore.values())
      .slice(0, 8)
      .map((s) => ({
        ...s,
        series: sampleHistoryRows(s.series, maxPoints),
      }));

    res.json({
      productId: product._id,
      name: product.name,
      categoryName: product.category ? product.category.name : "",
      days,
      stores,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/trends/trending", async (req, res, next) => {
  try {
    const days = Math.min(30, Math.max(1, parseInt(req.query.days, 10) || 7));
    const since = daysAgo(days);
    const weekAgo = daysAgo(days * 2);

    const products = await Product.find({ status: "active" })
      .populate("category")
      .sort({ name: 1 })
      .lean();

    const trending = [];
    for (const product of products) {
      const [recent, previous] = await Promise.all([
        PriceHistory.aggregate([
          { $match: { product: product._id, recordedAt: { $gte: since } } },
          { $group: { _id: null, avg: { $avg: "$price" } } },
        ]),
        PriceHistory.aggregate([
          {
            $match: {
              product: product._id,
              recordedAt: { $gte: weekAgo, $lt: since },
            },
          },
          { $group: { _id: null, avg: { $avg: "$price" } } },
        ]),
      ]);

      const currentAvg = recent[0] ? Math.round(recent[0].avg) : product.price;
      const prevAvg = previous[0] ? Math.round(previous[0].avg) : currentAvg;
      const change = prevAvg ? Math.round(((currentAvg - prevAvg) / prevAvg) * 100) : 0;

      trending.push({
        productId: product._id,
        name: product.name,
        category: product.category ? product.category.name : "",
        image: product.image || "",
        currentPrice: currentAvg,
        previousPrice: prevAvg,
        changePercent: change,
        trend: change > 2 ? "rising" : change < -2 ? "falling" : "stable",
      });
    }

    trending.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
    res.json({ days, items: trending.slice(0, 12) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
