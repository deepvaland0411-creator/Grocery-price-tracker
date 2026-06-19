const mongoose = require("mongoose");

const priceHistorySchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
    price: { type: Number, required: true, min: 0 },
    recordedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

priceHistorySchema.index({ product: 1, store: 1, recordedAt: -1 });
priceHistorySchema.index({ recordedAt: -1 });
priceHistorySchema.index({ product: 1, recordedAt: -1 });

module.exports = mongoose.model("PriceHistory", priceHistorySchema);
