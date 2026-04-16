const mongoose = require("mongoose");

const contactMessageSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 120 },
    lastName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    subject: {
      type: String,
      required: true,
      enum: ["general", "support", "feedback", "partnership", "other"],
    },
    message: { type: String, required: true, maxlength: 10000 },
    status: {
      type: String,
      enum: ["new", "replied", "closed"],
      default: "new",
      index: true,
    },
    read: { type: Boolean, default: false, index: true },
    reply: { type: String, default: "", maxlength: 10000 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ContactMessage", contactMessageSchema);
