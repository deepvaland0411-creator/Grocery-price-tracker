const { connectDb } = require("./db");
const Product = require("./models/product.model");
const { productImages } = require("./seed-data");

async function run() {
  await connectDb();
  const all = await Product.find({}).select("name image");
  let updated = 0;

  for (const product of all) {
    const nextImage = productImages[product.name];
    if (!nextImage || product.image === nextImage) continue;
    await Product.updateOne({ _id: product._id }, { $set: { image: nextImage } });
    updated += 1;
  }

  console.log("Updated product images: " + updated + " / " + all.length);
  process.exit(0);
}

run().catch(function (error) {
  console.error("Update failed:", error.message);
  process.exit(1);
});
