import mongoose from "mongoose";

const mediaLinkSchema = new mongoose.Schema({
  brochureName: {
    type: String,
    required: true,
    ref: "Brochure",
    index: true,
  },
  pageNumber: {
    type: Number,
    required: true,
    min: 1,
  },
  link: {
    type: String,
    trim: true,
    maxlength: 2000,
  },
  linkType: {
    type: String,
    enum: ["video", "audio", "youtube", "other","image"],
    default: "other",
  },
  coordinates: {
    x: {
      type: Number,
      required: true,
    },
    y: {
      type: Number,
      required: true,
    },
    width: {
      type: Number,
      default: 10,
      min: 1,
      max: 500,
      validate: {
        validator: function (v) {
          return typeof v === "number" && v >= 1 && v <= 50;
        },
        message: "Width must be between 1 and 50",
      },
    },
    height: {
      type: Number,
      default: 8,
      min: 1,
      max: 500,
      validate: {
        validator: function (v) {
          return typeof v === "number" && v >= 1 && v <= 50;
        },
        message: "Height must be between 1 and 50",
      },
    },
  },

  isImage: {
    type: Boolean,
    default: true,
  },
  images: {
    type: [String],
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

const mediaLinkModel = mongoose.model("mediaLink", mediaLinkSchema);

export default mediaLinkModel;
