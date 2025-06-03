import mongoose from "mongoose";

const brochureSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[a-z0-9-]+$/, // Only lowercase letters, numbers, and hyphens
    index: true,
  },
  displayName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  totalPages: {
    type: Number,
    required: true,
    min: 1,
    max: 1000,
  },
  images: {
    type: [String], // Array of strings, not objects
    default: [],
  },

  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const brochureModel = mongoose.model("brochure", brochureSchema);

export default brochureModel;