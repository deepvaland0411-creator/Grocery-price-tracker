const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Category = require("../models/category.model");
const Product = require("../models/product.model");
const Store = require("../models/store.model");
const ProductStorePrice = require("../models/productStorePrice.model");
const ContactMessage = require("../models/contactMessage.model");
const Admin = require("../models/admin.model");
const config = require("../config");
const { requireAdmin } = require("../middleware/adminAuth");
const { sendContactReplyEmail } = require("../mail");
const { parsePaging, slugify } = require("../utils");

const SUBJECT_LABELS = {
  general: "General Inquiry",
  support: "Technical Support",
  feedback: "Feedback",
  partnership: "Partnership",
  other: "Other",
};

function formatAdminMessage(doc) {
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(d._id),
    firstName: d.firstName,
    lastName: d.lastName,
    name: `${d.firstName} ${d.lastName}`.trim(),
    email: d.email,
    subject: SUBJECT_LABELS[d.subject] || d.subject,
    subjectKey: d.subject,
    message: d.message,
    status: d.status,
    unread: !d.read,
    date: d.createdAt,
    reply: d.reply || "",
  };
}

const router = express.Router();

router.post("/auth/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }
    const admin = await Admin.findOne({ email, isActive: { $ne: false } });
    if (!admin) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const token = jwt.sign(
      { sub: String(admin._id), email: admin.email },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );
    res.json({
      token,
      admin: {
        id: String(admin._id),
        email: admin.email,
        name: admin.name || "",
      },
    });
  } catch (error) {
    next(error);
  }
});

router.use(requireAdmin);

router.get("/auth/me", async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.adminId).lean();
    if (!admin || admin.isActive === false) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.json({
      id: String(admin._id),
      email: admin.email,
      name: admin.name || "",
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/auth/password", async (req, res, next) => {
  try {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }
    const admin = await Admin.findById(req.adminId);
    if (!admin) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const ok = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!ok) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }
    admin.passwordHash = await bcrypt.hash(newPassword, 10);
    await admin.save();
    res.json({ message: "Password updated" });
  } catch (error) {
    next(error);
  }
});

router.get("/admins", async (_req, res, next) => {
  try {
    const list = await Admin.find({ isActive: { $ne: false } })
      .sort({ createdAt: 1 })
      .lean();
    res.json({
      items: list.map((a) => ({
        id: String(a._id),
        email: a.email,
        name: a.name || "",
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/admins", async (req, res, next) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");
    const name = String(req.body.name || "").trim() || email.split("@")[0];
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }
    const exists = await Admin.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: "An admin with this email already exists" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const created = await Admin.create({ email, passwordHash, name });
    res.status(201).json({
      id: String(created._id),
      email: created.email,
      name: created.name,
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/admins/:id", async (req, res, next) => {
  try {
    const count = await Admin.countDocuments({ isActive: { $ne: false } });
    if (count <= 1) {
      return res.status(400).json({ message: "Cannot remove the last admin" });
    }
    if (String(req.adminId) === req.params.id) {
      return res.status(400).json({ message: "You cannot remove your own account" });
    }
    const deleted = await Admin.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Admin not found" });
    }
    res.json({ message: "Admin removed" });
  } catch (error) {
    next(error);
  }
});

function parseStorePriceEntry(e) {
  if (!e || !e.storeId) return null;
  if (e.available === false) return null;
  const raw = e.price;
  if (raw === "" || raw === null || raw === undefined) return null;
  const n = Number(raw);
  if (Number.isNaN(n) || n < 0) return null;
  return { store: e.storeId, price: n };
}

async function replaceProductStorePrices(productId, entries) {
  await ProductStorePrice.deleteMany({ product: productId });
  if (!entries || !entries.length) return;
  const docs = entries
    .map((e) => {
      const parsed = parseStorePriceEntry(e);
      if (!parsed) return null;
      return { product: productId, store: parsed.store, price: parsed.price };
    })
    .filter(Boolean);
  if (docs.length) await ProductStorePrice.insertMany(docs);
}

router.get("/summary", async (_req, res, next) => {
  try {
    const [
      productCount,
      storeCount,
      categoryCount,
      activeCategoryCount,
      messageCount,
      unreadMessageCount,
    ] = await Promise.all([
      Product.countDocuments(),
      Store.countDocuments(),
      Category.countDocuments(),
      Category.countDocuments({ status: "active" }),
      ContactMessage.countDocuments(),
      ContactMessage.countDocuments({ read: false }),
    ]);
    res.json({
      productCount,
      storeCount,
      categoryCount,
      activeCategoryCount,
      messageCount,
      unreadMessageCount,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/categories", async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const { skip, limit, page } = parsePaging(req.query);
    const filter = {};
    if (status) filter.status = status;
    if (search) filter.name = { $regex: search, $options: "i" };

    const [items, total] = await Promise.all([
      Category.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Category.countDocuments(filter),
    ]);
    for (const c of items) {
      c.productCount = await Product.countDocuments({ category: c._id });
    }
    res.json({ items, total, page, limit });
  } catch (error) {
    next(error);
  }
});

router.post("/categories", async (req, res, next) => {
  try {
    const payload = {
      name: req.body.name,
      slug: req.body.slug ? slugify(req.body.slug) : slugify(req.body.name),
      description: req.body.description || "",
      icon: req.body.icon || "",
      color: req.body.color || "#22c55e",
      status: req.body.status || "active",
    };
    const created = await Category.create(payload);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.put("/categories/:id", async (req, res, next) => {
  try {
    const update = {
      ...req.body,
      slug: req.body.slug ? slugify(req.body.slug) : undefined,
    };
    const updated = await Category.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!updated) return res.status(404).json({ message: "Category not found" });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete("/categories/:id", async (req, res, next) => {
  try {
    const found = await Category.findById(req.params.id);
    if (!found) return res.status(404).json({ message: "Category not found" });
    const prodIds = await Product.find({ category: found._id }).distinct("_id");
    await ProductStorePrice.deleteMany({ product: { $in: prodIds } });
    await Product.deleteMany({ category: found._id });
    await Category.findByIdAndDelete(req.params.id);
    res.json({ message: "Category deleted" });
  } catch (error) {
    next(error);
  }
});

router.get("/products", async (req, res, next) => {
  try {
    const { search, status, category } = req.query;
    const { skip, limit, page } = parsePaging(req.query);
    const filter = {};
    if (status) filter.status = status;
    if (search) filter.name = { $regex: search, $options: "i" };
    if (category) {
      const cat = await Category.findOne({
        $or: [{ _id: category }, { slug: category }, { name: category }],
      });
      filter.category = cat ? cat._id : null;
    }

    const [items, total] = await Promise.all([
      Product.find(filter).populate("category").sort({ createdAt: -1 }).skip(skip).limit(limit),
      Product.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit });
  } catch (error) {
    next(error);
  }
});

router.get("/products/:id/store-prices", async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    const stores = await Store.find().sort({ name: 1 }).lean();
    const prices = await ProductStorePrice.find({ product: product._id }).lean();
    const map = new Map(prices.map((p) => [String(p.store), p.price]));
    const entries = stores.map((s) => ({
      storeId: s._id,
      storeName: s.name,
      price: map.has(String(s._id)) ? map.get(String(s._id)) : null,
    }));
    res.json({ productId: product._id, basePrice: product.price, entries });
  } catch (error) {
    next(error);
  }
});

router.put("/products/:id/store-prices", async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    const entries = req.body.entries || req.body.storePrices;
    await replaceProductStorePrices(product._id, entries);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post("/products", async (req, res, next) => {
  try {
    const categoryId = req.body.categoryId || req.body.category;
    const created = await Product.create({
      name: req.body.name,
      category: categoryId,
      price: Number(req.body.price),
      image: req.body.image || "",
      status: req.body.status || "active",
    });
    const entries = req.body.storePrices || req.body.entries;
    if (Array.isArray(entries) && entries.length) {
      await replaceProductStorePrices(created._id, entries);
    }
    // Otherwise no per-store rows until admin saves store prices (UI sends PUT after create).
    const populated = await created.populate("category");
    res.status(201).json(populated);
  } catch (error) {
    next(error);
  }
});

router.put("/products/:id", async (req, res, next) => {
  try {
    const { storePrices, entries, categoryId, ...rest } = req.body;
    const update = {};
    if (rest.name !== undefined) update.name = rest.name;
    if (categoryId !== undefined || rest.category !== undefined) {
      update.category = categoryId || rest.category;
    }
    if (rest.price !== undefined) update.price = Number(rest.price);
    if (rest.image !== undefined) update.image = rest.image;
    if (rest.status !== undefined) update.status = rest.status;

    const updated = await Product.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    }).populate("category");
    if (!updated) return res.status(404).json({ message: "Product not found" });

    const priceEntries = entries || storePrices;
    if (Array.isArray(priceEntries)) {
      await replaceProductStorePrices(updated._id, priceEntries);
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete("/products/:id", async (req, res, next) => {
  try {
    await ProductStorePrice.deleteMany({ product: req.params.id });
    const found = await Product.findByIdAndDelete(req.params.id);
    if (!found) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product deleted" });
  } catch (error) {
    next(error);
  }
});

router.get("/stores", async (req, res, next) => {
  try {
    const { search, status } = req.query;
    const { skip, limit, page } = parsePaging(req.query);
    const filter = {};
    if (status) filter.status = status;
    if (search) filter.name = { $regex: search, $options: "i" };
    const [items, total] = await Promise.all([
      Store.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Store.countDocuments(filter),
    ]);
    const storeIds = items.map((s) => s._id);
    let countMap = new Map();
    if (storeIds.length) {
      const counts = await ProductStorePrice.aggregate([
        { $match: { store: { $in: storeIds } } },
        {
          $lookup: {
            from: "products",
            localField: "product",
            foreignField: "_id",
            as: "prod",
          },
        },
        { $unwind: "$prod" },
        { $match: { "prod.status": "active" } },
        { $group: { _id: "$store", productCount: { $sum: 1 } } },
      ]);
      countMap = new Map(counts.map((c) => [String(c._id), c.productCount]));
    }
    const enriched = items.map((s) => ({
      ...s,
      productCount: countMap.get(String(s._id)) || 0,
    }));
    res.json({ items: enriched, total, page, limit });
  } catch (error) {
    next(error);
  }
});

router.post("/stores", async (req, res, next) => {
  try {
    const created = await Store.create({
      name: req.body.name,
      location: req.body.location || "",
      status: req.body.status || "active",
    });
    // Per-store prices are set from each product (no automatic row per product).
    if (req.body.seedAllProductPrices === true) {
      const products = await Product.find().select("_id price").lean();
      if (products.length) {
        const rows = products.map((p) => ({
          product: p._id,
          store: created._id,
          price: Math.max(0, Math.round(Number(p.price) || 0)),
        }));
        await ProductStorePrice.insertMany(rows);
      }
    }
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.put("/stores/:id", async (req, res, next) => {
  try {
    const updated = await Store.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!updated) return res.status(404).json({ message: "Store not found" });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete("/stores/:id", async (req, res, next) => {
  try {
    await ProductStorePrice.deleteMany({ store: req.params.id });
    const found = await Store.findByIdAndDelete(req.params.id);
    if (!found) return res.status(404).json({ message: "Store not found" });
    res.json({ message: "Store deleted" });
  } catch (error) {
    next(error);
  }
});

/** Flat list of every product×store price (for admin Price Updates page). */
router.get("/price-rows", async (_req, res, next) => {
  try {
    const rows = await ProductStorePrice.find()
      .populate({
        path: "product",
        select: "name status image price category",
        populate: { path: "category", select: "name" },
      })
      .populate("store", "name status")
      .sort({ updatedAt: -1 })
      .lean();

    const items = rows
      .filter(
        (r) =>
          r.product &&
          r.product.status === "active" &&
          r.store &&
          r.store.status === "active"
      )
      .map((r) => ({
        id: `${r.product._id}_${r.store._id}`,
        productId: String(r.product._id),
        storeId: String(r.store._id),
        product: r.product.name,
        category: r.product.category && r.product.category.name ? r.product.category.name : "",
        store: r.store.name,
        currentPrice: r.price,
        image: r.product.image || "",
        updatedAt: r.updatedAt,
      }));
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.get("/messages", async (req, res, next) => {
  try {
    const { skip, limit, page } = parsePaging(req.query);
    const [items, total, unreadCount] = await Promise.all([
      ContactMessage.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ContactMessage.countDocuments(),
      ContactMessage.countDocuments({ read: false }),
    ]);
    res.json({
      items: items.map((doc) => formatAdminMessage(doc)),
      total,
      unreadCount,
      page,
      limit,
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/messages/:id", async (req, res, next) => {
  try {
    const updates = {};
    if (typeof req.body.read === "boolean") updates.read = req.body.read;
    if (req.body.status && ["new", "replied", "closed"].includes(req.body.status)) {
      updates.status = req.body.status;
    }
    if (req.body.reply !== undefined) updates.reply = String(req.body.reply).slice(0, 10000);
    if (Object.keys(updates).length === 0) {
      const doc = await ContactMessage.findById(req.params.id).lean();
      if (!doc) return res.status(404).json({ message: "Message not found" });
      return res.json(formatAdminMessage(doc));
    }
    const shouldEmailReply =
      req.body.reply !== undefined && String(req.body.reply || "").trim().length > 0;

    const updated = await ContactMessage.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!updated) return res.status(404).json({ message: "Message not found" });

    const payload = formatAdminMessage(updated);
    if (shouldEmailReply) {
      const mailResult = await sendContactReplyEmail({
        to: updated.email,
        firstName: updated.firstName,
        subjectLabel: SUBJECT_LABELS[updated.subject] || updated.subject,
        originalMessage: updated.message,
        replyText: String(updated.reply || "").trim(),
      });
      payload.mailSent = mailResult.sent;
      if (mailResult.reason) payload.mailNotice = mailResult.reason;
      if (mailResult.error) payload.mailError = mailResult.error;
    }

    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.delete("/messages/:id", async (req, res, next) => {
  try {
    const found = await ContactMessage.findByIdAndDelete(req.params.id);
    if (!found) return res.status(404).json({ message: "Message not found" });
    res.json({ message: "Message deleted" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
