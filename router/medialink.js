import mediaLinkModel from "../models/MediaLinkSchema.js"; // Adjust path as needed
import brochureModel from "../models/BrochuresSchema.js"; // Adjust path as needed
import router from "./brochures.js";

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

// Create a new media link
router.post("/media-link", async (req, res) => {
  try {
    const {
      brochureName,
      pageNumber,
      link,
      linkType = "other",
      coordinates
    } = req.body;

    // Validation
    if (!brochureName || !pageNumber || !link || !coordinates) {
      return res.status(400).json({
        success: false,
        msg: "brochureName, pageNumber, link, and coordinates are required",
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

    // Validate coordinates structure
    const { x, y, width = 10, height = 8 } = coordinates;
    if (typeof x !== "number" || typeof y !== "number") {
      return res.status(400).json({
        success: false,
        msg: "Coordinates x and y must be numbers",
      });
    }

    // Create new media link
    const newMediaLink = new mediaLinkModel({
      brochureName: brochure.name, // Use the actual brochure name from DB
      pageNumber,
      link,
      linkType,
      coordinates: { x, y, width, height },
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

    // Get media links for specific page
    const mediaLinks = await mediaLinkModel
      .find(filter)


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

    const deletedMediaLink = await mediaLinkModel.findByIdAndDelete(id);

    if (!deletedMediaLink) {
      return res.status(404).json({
        success: false,
        msg: "Media link not found",
      });
    }

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



export default router