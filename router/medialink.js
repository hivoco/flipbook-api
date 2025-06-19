import mediaLinkModel from "../models/MediaLinkSchema.js"; // Adjust path as needed
import brochureModel from "../models/BrochuresSchema.js"; // Adjust path as needed
import router from "./brochures.js";

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

import multer from "multer";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || "your-bucket-name";

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error("Only image files (JPEG, JPG, PNG, WebP, GIF) are allowed"),
      false
    );
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 50, // Reduced from 1000 to prevent memory issues
  },
});

const uploadToS3 = async (file, brochureName) => {
  const fileName = `book/${brochureName}/${Date.now()}-${file.originalname}`;

  const uploadCommand = new PutObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype,
    // Removed ACL - will use bucket policy instead
  });

  try {
    const result = await s3Client.send(uploadCommand);
    // Construct the public URL
    const s3Url = `https://${S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    return { url: s3Url, key: fileName };
  } catch (error) {
    console.error("S3 upload error:", error);
    throw new Error(`Failed to upload ${file.originalname} to S3`);
  }
};

const deleteFromS3 = async (s3Key) => {
  const deleteCommand = new DeleteObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: s3Key,
  });

  try {
    await s3Client.send(deleteCommand);
  } catch (error) {
    console.error("S3 delete error:", error);
    throw new Error(`Failed to delete ${s3Key} from S3`);
  }
};

// Helper function to validate brochure exists
const validateBrochureExists = async (brochureName) => {
  const brochure = await brochureModel.findOne({
    name: brochureName.toLowerCase(),
  });
  return brochure;
};

const validatePageNumber = (pageNumber, totalPages) => {
  return pageNumber >= 1 && pageNumber <= totalPages;
};

// Helper function to parse coordinates
const parseCoordinates = (coordinates) => {
  try {
    let parsedCoordinates;
    if (typeof coordinates === "string") {
      parsedCoordinates = JSON.parse(coordinates);
    } else if (typeof coordinates === "object") {
      parsedCoordinates = coordinates;
    } else {
      throw new Error("Invalid coordinates format");
    }

    const { x, y, width = 10, height = 8 } = parsedCoordinates;

    if (typeof x !== "number" || typeof y !== "number") {
      throw new Error("Coordinates x and y must be numbers");
    }

    return { x, y, width, height };
  } catch (error) {
    throw new Error("Invalid coordinates format");
  }
};

// Create a new media link
router.post("/media-link", async (req, res) => {
  try {
    const {
      brochureName,
      pageNumber,
      link,
      linkType = "other",
      coordinates,
    } = req.body;

    // Validation
    if (!brochureName || !pageNumber || !link || !coordinates) {
      return res.status(400).json({
        success: false,
        msg: "brochureName, pageNumber, link and coordinates are required",
      });
    }

    // Validate brochure exists
    const brochure = await validateBrochureExists(brochureName);
    if (!brochure) {
      return res.status(404).json({
        success: false,
        msg: "Brochure not found",
      });
    }

    // Validate page number
    if (!validatePageNumber(pageNumber, brochure.totalPages)) {
      return res.status(400).json({
        success: false,
        msg: `Page number must be between 1 and ${brochure.totalPages}`,
      });
    }

    // Validate and parse coordinates
    let parsedCoordinates;
    try {
      parsedCoordinates = parseCoordinates(coordinates);
    } catch (error) {
      return res.status(400).json({
        success: false,
        msg: error.message,
      });
    }

    // Create new media link
    const newMediaLink = new mediaLinkModel({
      brochureName: brochure.name, // Use the actual brochure name from DB
      pageNumber,
      link,
      linkType,
      coordinates: parsedCoordinates,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const savedMediaLink = await newMediaLink.save();

    return res.status(201).json({
      success: true,
      msg: "Media link created successfully",
      data: savedMediaLink,
    });
  } catch (error) {
    console.error("Create media link error:", error);

    // Handle specific mongoose validation errors
    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      return res.status(400).json({
        success: false,
        msg: "Validation failed",
        errors: validationErrors,
      });
    }

    return res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
});

router.post(
  "/upload-image-link",
  upload.array("images", 50), // Reduced limit
  async (req, res) => {
    try {
      const { brochureName, pageNumber, coordinates } = req.body;
      const files = req.files;

      // Validation - handle form-data string values
      if (
        !brochureName ||
        brochureName.trim() === "" ||
        !pageNumber ||
        pageNumber.trim() === "" ||
        !coordinates ||
        coordinates.trim() === ""
      ) {
        return res.status(400).json({
          success: false,
          msg: "brochureName, pageNumber and coordinates are required",
        });
      }

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          msg: "At least one image is required",
        });
      }

      // Validate brochure exists BEFORE uploading to S3
      const brochure = await validateBrochureExists(brochureName);
      if (!brochure) {
        return res.status(404).json({
          success: false,
          msg: "Brochure not found",
        });
      }

      // Validate page number BEFORE uploading to S3
      const pageNum = parseInt(pageNumber);
      if (isNaN(pageNum) || !validatePageNumber(pageNum, brochure.totalPages)) {
        return res.status(400).json({
          success: false,
          msg: `Page number must be a valid number between 1 and ${brochure.totalPages}`,
        });
      }

      // Validate and parse coordinates BEFORE uploading to S3
      let parsedCoordinates;
      try {
        parsedCoordinates = parseCoordinates(coordinates);
      } catch (error) {
        return res.status(400).json({
          success: false,
          msg: error.message,
        });
      }

      // Now proceed with S3 upload
      const imageUrls = [];
      const s3Keys = []; // Track S3 keys for cleanup if needed
      const uploadPromises = files.map(async (file) => {
        try {
          const { url, key } = await uploadToS3(file, brochureName);
          imageUrls.push(url); // Push only the URL string
          s3Keys.push(key); // Push only the key string
          return {
            success: true,
            filename: file.originalname,
            url: url,
          };
        } catch (error) {
          return {
            success: false,
            filename: file.originalname,
            error: error.message,
          };
        }
      });

      const uploadResults = await Promise.allSettled(uploadPromises);

      // Check if any uploads failed
      const failedUploads = uploadResults
        .filter(
          (result) => result.status === "rejected" || !result.value.success
        )
        .map((result) => result.value || result.reason);

      if (failedUploads.length > 0) {
        // Cleanup successful uploads if some failed
        const successfulKeys = s3Keys.slice(0, imageUrls.length);
        for (const key of successfulKeys) {
          try {
            await deleteFromS3(key);
          } catch (cleanupError) {
            console.error("Cleanup error:", cleanupError);
          }
        }

        console.error("Failed uploads:", failedUploads);
        return res.status(500).json({
          success: false,
          msg: "Some images failed to upload",
          errors: failedUploads,
        });
      }

      // Create new media link
      const newMediaLink = new mediaLinkModel({
        brochureName: brochure.name, // Use the actual brochure name from DB
        pageNumber: pageNum, // Use the parsed integer
        isImage: true,
        images: imageUrls,
        linkType: "image",
        coordinates: parsedCoordinates,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const savedMediaLink = await newMediaLink.save();

      return res.status(201).json({
        success: true,
        msg: "Image media link created successfully",
        data: savedMediaLink,
      });
    } catch (error) {
      console.error("Create image media link error:", error);

      // Handle specific mongoose validation errors
      if (error.name === "ValidationError") {
        const validationErrors = Object.values(error.errors).map(
          (err) => err.message
        );
        return res.status(400).json({
          success: false,
          msg: "Validation failed",
          errors: validationErrors,
        });
      }

      return res.status(500).json({
        success: false,
        msg: "Internal server error",
      });
    }
  }
);

// Get all media links for a specific brochure
router.get("/media-links/:brochureName", async (req, res) => {
  try {
    const { brochureName } = req.params;
    const { pageNumber, isActive, linkType } = req.query;

    // Validate brochure exists
    const brochure = await validateBrochureExists(brochureName);
    if (!brochure) {
      return res.status(404).json({
        success: false,
        msg: "Brochure not found",
      });
    }

    // Build filter object
    const filter = { brochureName: brochure.name };

    if (pageNumber) {
      filter.pageNumber = parseInt(pageNumber);
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    if (linkType) {
      filter.linkType = linkType;
    }

    // Get media links
    const mediaLinks = await mediaLinkModel
      .find(filter)
      .sort({ priority: -1, createdAt: -1 }); // Sort by priority first, then newest

    return res.status(200).json({
      success: true,
      msg: "Media links retrieved successfully",
      count: mediaLinks.length,
      data: mediaLinks,
    });
  } catch (error) {
    console.error("Get media links error:", error);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
});

// Get media links for a specific page of a brochure
router.get("/media-links/:brochureName/page/:pageNumber", async (req, res) => {
  try {
    const { brochureName, pageNumber } = req.params;
    // const { isActive = "true" } = req.query;

    // Validate brochure exists
    const brochure = await validateBrochureExists(brochureName);
    if (!brochure) {
      return res.status(404).json({
        success: false,
        msg: "Brochure not found",
      });
    }

    // Validate page number
    const pageNum = parseInt(pageNumber);
    if (!validatePageNumber(pageNum, brochure.totalPages)) {
      return res.status(400).json({
        success: false,
        msg: `Page number must be between 1 and ${brochure.totalPages}`,
      });
    }

    // Build filter
    const filter = {
      brochureName: brochure.name,
      pageNumber: pageNum,
    };

    // if (isActive !== "all") {
    //   filter.isActive = isActive === "true";
    // }

    // Get media links for specific page - FIXED: Added proper query completion
    const mediaLinks = await mediaLinkModel
      .find(filter)
      .sort({ priority: -1, createdAt: -1 });

    return res.status(200).json({
      success: true,
      msg: `Media links for page ${pageNumber} retrieved successfully`,
      count: mediaLinks.length,
      data: mediaLinks,
    });
  } catch (error) {
    console.error("Get page media links error:", error);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
});

// Update a media link
router.put("/media-link/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Remove fields that shouldn't be updated directly
    delete updateData._id;
    delete updateData.createdAt;
    delete updateData.clickCount;
    delete updateData.lastClickedAt;

    // Add updated timestamp
    updateData.updatedAt = new Date();

    // If brochureName is being updated, validate it exists
    if (updateData.brochureName) {
      const brochure = await validateBrochureExists(updateData.brochureName);
      if (!brochure) {
        return res.status(404).json({
          success: false,
          msg: "Brochure not found",
        });
      }
      updateData.brochureName = brochure.name;
    }

    // If pageNumber is being updated, validate it
    if (updateData.pageNumber && updateData.brochureName) {
      const brochure = await validateBrochureExists(updateData.brochureName);
      if (!validatePageNumber(updateData.pageNumber, brochure.totalPages)) {
        return res.status(400).json({
          success: false,
          msg: `Page number must be between 1 and ${brochure.totalPages}`,
        });
      }
    }

    // If coordinates are being updated, validate and parse them
    if (updateData.coordinates) {
      try {
        updateData.coordinates = parseCoordinates(updateData.coordinates);
      } catch (error) {
        return res.status(400).json({
          success: false,
          msg: error.message,
        });
      }
    }

    const updatedMediaLink = await mediaLinkModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedMediaLink) {
      return res.status(404).json({
        success: false,
        msg: "Media link not found",
      });
    }

    return res.status(200).json({
      success: true,
      msg: "Media link updated successfully",
      data: updatedMediaLink,
    });
  } catch (error) {
    console.error("Update media link error:", error);

    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      return res.status(400).json({
        success: false,
        msg: "Validation failed",
        errors: validationErrors,
      });
    }

    return res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
});

// Delete a media link
router.delete("/media-link/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // First get the media link to check if it has images
    const mediaLink = await mediaLinkModel.findById(id);

    if (!mediaLink) {
      return res.status(404).json({
        success: false,
        msg: "Media link not found",
      });
    }

    // If it's an image media link, delete images from S3
    if (mediaLink.isImage && mediaLink.images && mediaLink.images.length > 0) {
      const deletePromises = mediaLink.images.map(async (imageUrl) => {
        try {
          // Extract S3 key from URL
          const urlParts = imageUrl.split("/");
          const key = urlParts.slice(3).join("/"); // Remove https://bucket.s3.region.amazonaws.com/
          await deleteFromS3(key);
        } catch (error) {
          console.error("Error deleting image from S3:", error);
          // Don't fail the whole operation if S3 cleanup fails
        }
      });

      await Promise.allSettled(deletePromises);
    }

    // Delete the media link from database
    const deletedMediaLink = await mediaLinkModel.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      msg: "Media link deleted successfully",
      data: deletedMediaLink,
    });
  } catch (error) {
    console.error("Delete media link error:", error);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
});

// Track media link click (analytics)
router.post("/media-link/:id/click", async (req, res) => {
  try {
    const { id } = req.params;

    const updatedMediaLink = await mediaLinkModel.findByIdAndUpdate(
      id,
      {
        $inc: { clickCount: 1 },
        lastClickedAt: new Date(),
      },
      { new: true }
    );

    if (!updatedMediaLink) {
      return res.status(404).json({
        success: false,
        msg: "Media link not found",
      });
    }

    return res.status(200).json({
      success: true,
      msg: "Click tracked successfully",
      data: {
        id: updatedMediaLink._id,
        clickCount: updatedMediaLink.clickCount,
        lastClickedAt: updatedMediaLink.lastClickedAt,
      },
    });
  } catch (error) {
    console.error("Track click error:", error);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
});

export default router;
