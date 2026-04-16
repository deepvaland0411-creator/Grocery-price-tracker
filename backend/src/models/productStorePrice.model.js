const mongoose = require("mongoose");

const productStorePriceSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    price: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

productStorePriceSchema.index({ product: 1, store: 1 }, { unique: true });

module.exports = mongoose.model("ProductStorePrice", productStorePriceSchema);
