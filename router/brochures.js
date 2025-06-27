import { Router } from "express";
import bcrypt from "bcrypt";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
const router = Router();
import multer from "multer";
import brochureModel from "../models/BrochuresSchema.js"; // Adjust path as needed
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { getContactInfo } from "../helper/common.js";
import mediaLinkModel from "../models/MediaLinkSchema.js";

// Configure AWS S3 Client (v3)
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || "your-bucket-name";

const storage = multer.memoryStorage();

// const fileFilter = (req, file, cb) => {
//   const allowedTypes = [
//     "image/jpeg",
//     "image/jpg",
//     "image/png",
//     "image/webp",
//     "image/gif",
//   ];

//   if (allowedTypes.includes(file.mimetype)) {
//     cb(null, true);
//   } else {
//     cb(new Error("Only image files (JPEG, PNG, WebP) are allowed"), false);
//   }
// };

// const upload = multer({
//   storage: storage,
//   fileFilter: fileFilter,
//   limits: {
//     fileSize: 10 * 1024 * 1024, // 10MB per file
//     files: 1000,
//   },
// });

// const VOICE_IDS = {
//   male: "8l89UrPQsmYVJoJRfnAt",
//   female: "KaCAGkAghyX8sFEYByRC",
// };
const VOICE_IDS = {
  male: "UzYWd2rD2PPFPjXRG3Ul",
  female: "CoQByuTrT9gbKYx6QFL6",
};

// ElevenLabs TTS function
async function generateTTS(text, voiceId) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const headers = {
    "xi-api-key": process.env.ELEVEN_API_KEY,
    "Content-Type": "application/json",
  };

  const payload = {
    text: text,
    model_id: "eleven_multilingual_v2",
    voice_settings: {
      stability: 0.5,
      // use_speaker_boost: true,
      similarity_boost: 0.75,
    },
  };

  try {
    const response = await axios.post(url, payload, {
      headers: headers,
      responseType: "arraybuffer",
    });

    return Buffer.from(response.data);
  } catch (error) {
    throw new Error(
      `ElevenLabs TTS API Error: ${error.response?.status} - ${
        error.response?.data || error.message
      }`
    );
  }
}

// Upload audio to S3
async function uploadAudioToS3(
  audioBuffer,
  filePrefix = "audio",
  brochureName
) {
  try {
    const fileName = `${brochureName}/${filePrefix}_${uuidv4().substring(
      0,
      8
    )}.mp3`;
    const s3Key = `audio/${fileName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: audioBuffer,
      ContentType: "audio/mpeg",
      // ACL: "public-read", // Make the file publicly accessible
    });

    await s3Client.send(command);

    const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${
      process.env.AWS_REGION || "ap-south-1"
    }.amazonaws.com/${s3Key}`;
    return s3Url;
  } catch (error) {
    throw new Error(`Failed to upload to S3: ${error.message}`);
  }
}

// Helper function to generate brochure name from display name
const generateBrochureName = (displayName) => {
  return displayName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters except spaces and hyphens
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
};

// Helper function to generate signed URLs for images
const generateSignedUrlsForBrochure = async (brochure, expiresIn = 3600) => {
  if (!brochure.images || brochure.images.length === 0) {
    return [];
  }

  const signedUrls = await Promise.all(
    brochure.images.map(async (imageUrl) => {
      try {
        const urlParts = imageUrl.split("/");
        const filename = urlParts[urlParts.length - 1];
        const key = `${brochure.name}/images/${filename}`;

        const command = new GetObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: key,
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
        return signedUrl;
      } catch (error) {
        console.error("Error generating signed URL:", error);
        return imageUrl; // Fallback to original URL
      }
    })
  );

  return signedUrls;
};
const uploadToS3 = async (file, brochureName) => {
  const fileName = `book/${brochureName}/${file.originalname}`;

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
    return s3Url;
  } catch (error) {
    console.error("S3 upload error:", error);
    throw new Error(`Failed to upload ${file.originalname} to S3`);
  }
};

// Upload brochure API endpoint
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    // Image types
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/svg+xml",

    // Video types
    "video/mp4",
    "video/avi",
    "video/mov",
    "video/wmv",
    "video/flv",
    "video/webm",
    "video/mkv",
    "video/3gp",
    "video/quicktime",

    // Audio types
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/ogg",
    "audio/aac",
    "audio/flac",
    "audio/m4a",
    "audio/wma",
    "audio/webm",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `File type ${file.mimetype} is not allowed. Only video, image, and audio files are supported.`
      ),
      false
    );
  }
};

// Configure multer with file size limits
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB per file
    files: 50, // Maximum 50 files at once
  },
});

// Helper function to determine file category based on mimetype
const getFileCategory = (mimetype) => {
  if (mimetype.startsWith("image/")) return "images";
  if (mimetype.startsWith("video/")) return "videos";
  if (mimetype.startsWith("audio/")) return "audio";
  return "files"; // fallback
};

// Helper function to get file extension from mimetype
const getFileExtension = (mimetype, originalname) => {
  // Try to get extension from original filename first
  const extensionFromName = originalname.split(".").pop();
  if (extensionFromName && extensionFromName.length <= 4) {
    return extensionFromName.toLowerCase();
  }

  // Fallback to mimetype mapping
  const mimetypeMap = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/bmp": "bmp",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/avi": "avi",
    "video/mov": "mov",
    "video/wmv": "wmv",
    "video/flv": "flv",
    "video/webm": "webm",
    "video/mkv": "mkv",
    "video/3gp": "3gp",
    "video/quicktime": "mov",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/aac": "aac",
    "audio/flac": "flac",
    "audio/m4a": "m4a",
    "audio/wma": "wma",
    "audio/webm": "webm",
  };

  return mimetypeMap[mimetype] || "bin";
};

// Upload function to S3
const uploadFileToS3 = async (file, brochureName) => {
  try {
    const fileCategory = getFileCategory(file.mimetype);
    const fileExtension = getFileExtension(file.mimetype, file.originalname);
    const uniqueId = uuidv4().substring(0, 8);

    // Clean the original filename
    const cleanFileName = file.originalname
      .replace(/[^a-zA-Z0-9.-]/g, "_") // Replace special chars with underscore
      // .replace(/{2,}/g, "") // Replace multiple underscores with single
      .replace(/^|$/g, ""); // Remove leading/trailing underscores

    // Create unique filename
    const fileName = `${
      cleanFileName.split(".")[0]
    }_${uniqueId}.${fileExtension}`;
    const s3Key = `${brochureName}/${fileCategory}/${fileName}`;

    const uploadCommand = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
      Body: file.buffer,
      ContentType: file.mimetype,
      Metadata: {
        "original-name": file.originalname,
        "brochure-name": brochureName,
        "file-category": fileCategory,
        "upload-timestamp": new Date().toISOString(),
      },
    });

    await s3Client.send(uploadCommand);

    // Construct the public URL
    const s3Url = `https://${S3_BUCKET_NAME}.s3.${
      process.env.AWS_REGION || "us-east-1"
    }.amazonaws.com/${s3Key}`;

    return {
      success: true,
      url: s3Url,
      key: s3Key,
      category: fileCategory,
      originalName: file.originalname,
      fileName: fileName,
      size: file.size,
      mimetype: file.mimetype,
    };
  } catch (error) {
    console.error("S3 upload error:", error);
    throw new Error(
      `Failed to upload ${file.originalname} to S3: ${error.message}`
    );
  }
};

router.post(
  "/upload-brochure",
  upload.array("images", 1000),
  async (req, res) => {
    try {
      const { displayName, personName } = req.body;
      const files = req.files;

      // Validation
      if (!displayName || !displayName.trim()) {
        return res.status(400).json({
          success: false,
          msg: "Display name is required",
          debug: {
            receivedBody: req.body,
            receivedFiles: files?.length || 0,
            displayNameValue: displayName,
            displayNameType: typeof displayName,
          },
        });
      }

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          msg: "At least one image is required",
        });
      }

      let brochureName = generateBrochureName(displayName);
      let counter = 1;
      let originalName = brochureName;

      while (await brochureModel.findOne({ name: brochureName })) {
        brochureName = `${originalName}-${counter}`;
        counter++;
      }

      const imageUrls = [];
      const uploadPromises = files.map(async (file) => {
        try {
          const s3Url = await uploadToS3(file, brochureName);
          imageUrls.push(s3Url);
          return {
            success: true,
            filename: file.originalname,
            url: s3Url,
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
        console.error("Failed uploads:", failedUploads);
        return res.status(500).json({
          success: false,
          msg: "Some images failed to upload",
          errors: failedUploads,
        });
      }

      // Create new brochure with S3 URLs
      const newBrochure = new brochureModel({
        name: brochureName,
        personName: personName.toLowerCase(),
        displayName: displayName.trim(),
        totalPages: files.length,
        images: imageUrls, // Store S3 URLs in images object
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Save to database
      const savedBrochure = await newBrochure.save();

      return res.status(201).json({
        success: true,
        msg: "Brochure uploaded successfully",
        data: {
          id: savedBrochure._id,
          name: savedBrochure.name,
          personName: savedBrochure.personName,
          displayName: savedBrochure.displayName,
          totalPages: savedBrochure.totalPages,
          images: savedBrochure.images,
          createdAt: savedBrochure.createdAt,
        },
      });
    } catch (error) {
      console.error("Brochure upload error:", error);

      // If there was an error after some files were uploaded, you might want to clean up S3
      // This is optional but recommended for production

      return res.status(500).json({
        success: false,
        msg: "Internal server error",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

// Get brochure by name with images (with signed URLs if needed)
// Get brochure by name with images (with signed URLs if needed)
router.get("/brochure/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const { generateSignedUrls = false } = req.query;

    const brochure = await brochureModel.findOne({ name: name.toLowerCase() });

    if (!brochure) {
      return res.status(404).json({
        success: false,
        msg: "Brochure not found",
      });
    }

    let responseData = null;
    if (brochure.personName) {
      const contactInfo = getContactInfo(brochure.personName);
      responseData = { contactInfo, ...brochure.toObject() };
    } else {
      responseData = { ...brochure.toObject() };
    }

    // Sort images in ascending order by numeric value in filename
    if (brochure.images && brochure.images.length > 0) {
      const sortedImages = brochure.images.sort((a, b) => {
        // Extract number from filename (handles both "1.png" and "placeholder-4.png")
        const getNumber = (url) => {
          const filename = url.split("/").pop(); // Get filename from URL
          const match = filename.match(/(\d+)/); // Extract first number found
          return match ? parseInt(match[1]) : 0;
        };

        return getNumber(a) - getNumber(b);
      });

      responseData.images = sortedImages;
    }

    // Generate signed URLs if requested (for private objects)
    if (generateSignedUrls && responseData.images) {
      const signedUrls = await Promise.all(
        responseData.images.map(async (imageUrl) => {
          try {
            const urlParts = imageUrl.split("/");
            const filename = urlParts[urlParts.length - 1];
            const key = `${brochure.name}/images/${filename}`;

            const command = new GetObjectCommand({
              Bucket: S3_BUCKET_NAME,
              Key: key,
            });

            const signedUrl = await getSignedUrl(s3Client, command, {
              expiresIn: 3600,
            }); // 1 hour
            return signedUrl;
          } catch (error) {
            console.error("Error generating signed URL:", error);
            return imageUrl; // Fallback to original URL
          }
        })
      );

      responseData.images = signedUrls;
    }

    return res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error("Get brochure error:", error);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
});

// Endpoint to list all brochures with pagination and optional signed URLs
router.get("/brochures", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
      generateSignedUrls = false,
    } = req.query;

    // Build filter object
    const filter = {};

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Get brochures with pagination
    const brochures = await brochureModel
      .find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Generate signed URLs if requested
    let processedBrochures = brochures;
    if (generateSignedUrls === "true") {
      processedBrochures = await Promise.all(
        brochures.map(async (brochure) => {
          const brochureObj = brochure.toObject();
          brochureObj.images = await generateSignedUrlsForBrochure(brochure);
          return brochureObj;
        })
      );
    }

    const totalCount = await brochureModel.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / parseInt(limit));

    return res.status(200).json({
      success: true,
      data: {
        brochures: processedBrochures,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1,
        },
      },
    });
  } catch (error) {
    console.error("List brochures error:", error);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
});

router.patch("/brochure/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const data = req.body;

    console.log("data", data);

    // Find existing brochure
    const existingBrochure = await brochureModel.findOne({ name });
    if (!existingBrochure) {
      return res.status(404).json({
        success: false,
        msg: "Brochure not found",
      });
    }
    console.log("start");
    // Toggle the isLandScape field
    // const currentValue = existingBrochure.isLandScape || false;
    // const currentSoundValue = existingBrochure.pageFlipSound || false;
    // const newValue = !currentValue;
    // const newSoundValue = !currentSoundValue;

    // Update brochure in database
    const updatedBrochure = await brochureModel.findOneAndUpdate(
      { name },
      {
        ...data,
        updatedAt: new Date(),
      },
      { new: true, runValidators: true }
    );
    console.log("updatedBrochure", updatedBrochure);

    // Prepare response data
    let responseData = updatedBrochure.toObject();

    // Sort images in the response
    if (responseData.images && responseData.images.length > 0) {
      const sortedImages = responseData.images.sort((a, b) => {
        const getNumber = (url) => {
          const filename = url.split("/").pop();
          const match = filename.match(/(\d+)/);
          return match ? parseInt(match[1]) : 0;
        };
        return getNumber(a) - getNumber(b);
      });
      responseData.images = sortedImages;
    }

    // Add contact info if person name exists
    if (responseData.personName) {
      const contactInfo = getContactInfo(responseData.personName);
      responseData = { contactInfo, ...responseData };
    }

    return res.status(200).json({
      success: true,
      msg: `updated successfully`,
      data: responseData,
    });
  } catch (error) {
    console.error("Toggle landscape error:", error);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Optional: Endpoint to delete brochure and cleanup S3 files
router.delete("/brochure/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const { forceDelete = false } = req.query; // Optional parameter for force deletion

    // Find the brochure by name (not ID)
    const brochure = await brochureModel.findOne({ name: name.toLowerCase() });
    if (!brochure) {
      return res.status(404).json({
        success: false,
        msg: "Brochure not found",
      });
    }

    // console.log(Starting deletion process for brochure: ${brochure.name});

    // Step 1: Find all associated media links
    const mediaLinks = await mediaLinkModel.find({
      brochureName: brochure.name,
    });

    // console.log(Found ${mediaLinks.length} media links to delete);

    // Step 2: Delete images from media links from S3
    const mediaLinkImageDeletions = [];
    for (const mediaLink of mediaLinks) {
      if (
        mediaLink.isImage &&
        mediaLink.images &&
        mediaLink.images.length > 0
      ) {
        for (const imageUrl of mediaLink.images) {
          try {
            // Extract S3 key from URL
            const urlParts = imageUrl.split("/");
            const key = urlParts.slice(3).join("/"); // Remove https://bucket.s3.region.amazonaws.com/

            const deleteCommand = new DeleteObjectCommand({
              Bucket: S3_BUCKET_NAME,
              Key: key,
            });

            mediaLinkImageDeletions.push(s3Client.send(deleteCommand));
            // console.log(Queued media link image for deletion: ${key});
          } catch (error) {
            // console.error(
            //   Error queuing media link image for deletion: ${imageUrl},
            //   error
            // );
            if (!forceDelete) {
              return res.status(500).json({
                success: false,
                msg: `Failed to delete media link image: ${imageUrl}`,
                error: error.message,
              });
            }
          }
        }
      }
    }

    // Step 3: Delete brochure images from S3
    const brochureImageDeletions = [];
    if (brochure.images && brochure.images.length > 0) {
      for (const imageUrl of brochure.images) {
        try {
          // Extract the filename from the URL
          const urlParts = imageUrl.split("/");
          const filename = urlParts[urlParts.length - 1];
          const key = `book/${brochure.name}/${filename}`;

          const deleteCommand = new DeleteObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: key,
          });

          brochureImageDeletions.push(s3Client.send(deleteCommand));
          // console.log(Queued brochure image for deletion: ${key});
        } catch (error) {
          console.error(`
            Error queuing brochure image for deletion: ${imageUrl},
            error`);
          if (!forceDelete) {
            return res.status(500).json({
              success: false,
              msg: `Failed to delete brochure image: ${imageUrl}`,
              error: error.message,
            });
          }
        }
      }
    }

    // Step 4: Delete audio files from S3 (all files in the audio/brochureName/ folder)
    const audioFolderKey = `audio/${brochure.name}/`;
    let audioFileDeletions = [];

    try {
      // List all objects in the audio folder
      const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
      const listCommand = new ListObjectsV2Command({
        Bucket: S3_BUCKET_NAME,
        Prefix: audioFolderKey,
      });

      const listResponse = await s3Client.send(listCommand);

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        audioFileDeletions = listResponse.Contents.map((object) => {
          const deleteCommand = new DeleteObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: object.Key,
          });
          console.log(`Queued audio file for deletion: ${object.Key}`);
          return s3Client.send(deleteCommand);
        });
      }
    } catch (error) {
      console.error("Error listing/deleting audio files:", error);
      if (!forceDelete) {
        return res.status(500).json({
          success: false,
          msg: "Failed to delete audio files",
          error: error.message,
        });
      }
    }

    // Step 5: Execute all S3 deletions in parallel
    const allS3Deletions = [
      ...mediaLinkImageDeletions,
      ...brochureImageDeletions,
      ...audioFileDeletions,
    ];

    if (allS3Deletions.length > 0) {
      try {
        console.log(
          `Executing ${allS3Deletions.length} S3 deletion operations...`
        );
        const deletionResults = await Promise.allSettled(allS3Deletions);

        const failedDeletions = deletionResults.filter(
          (result) => result.status === "rejected"
        );

        if (failedDeletions.length > 0 && !forceDelete) {
          console.error("Some S3 deletions failed:", failedDeletions);
          return res.status(500).json({
            success: false,
            msg: "Some S3 files failed to delete",
            failedCount: failedDeletions.length,
            totalCount: allS3Deletions.length,
          });
        }

        console.log(
          `S3 deletions completed. Failed: ${
            failedDeletions.length
          }, Success: ${deletionResults.length - failedDeletions.length}`
        );
      } catch (error) {
        console.error("Error during S3 deletion batch:", error);
        if (!forceDelete) {
          return res.status(500).json({
            success: false,
            msg: "Failed to delete files from S3",
            error: error.message,
          });
        }
      }
    }

    // Step 6: Delete media links from database
    let deletedMediaLinksCount = 0;
    if (mediaLinks.length > 0) {
      try {
        const mediaLinkDeletionResult = await mediaLinkModel.deleteMany({
          brochureName: brochure.name,
        });
        deletedMediaLinksCount = mediaLinkDeletionResult.deletedCount;
        // console.log(
        //   Deleted ${deletedMediaLinksCount} media links from database
        // );
      } catch (error) {
        console.error("Error deleting media links:", error);
        if (!forceDelete) {
          return res.status(500).json({
            success: false,
            msg: "Failed to delete media links from database",
            error: error.message,
          });
        }
      }
    }

    // Step 7: Delete brochure from database
    try {
      await brochureModel.findByIdAndDelete(brochure._id);
      // console.log(Deleted brochure ${brochure.name} from database);
    } catch (error) {
      console.error("Error deleting brochure:", error);
      return res.status(500).json({
        success: false,
        msg: "Failed to delete brochure from database",
        error: error.message,
      });
    }

    // Step 8: Return success response with summary
    return res.status(200).json({
      success: true,
      msg: "Brochure and all associated data deleted successfully",
      summary: {
        brochureName: brochure.name,
        brochureDisplayName: brochure.displayName,
        deletedMediaLinks: deletedMediaLinksCount,
        deletedBrochureImages: brochure.images?.length || 0,
        deletedS3Objects: allS3Deletions.length,
        deletedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Brochure deletion error:", error);
    return res.status(500).json({
      success: false,
      msg: "Internal server error during brochure deletion",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

router.post("/api/tts", async (req, res) => {
  try {
    const { text, gender, brochureName } = req.body;

    // Validation
    if (!text || !gender) {
      return res.status(400).json({
        success: false,
        error: "Both text and gender are required",
      });
    }

    if (!VOICE_IDS[gender.toLowerCase()]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid gender. Use "male" or "female"',
      });
    }

    const voiceId = VOICE_IDS[gender.toLowerCase()];

    // Generate TTS audio
    console.log(`Generating TTS for text: "${text}" with voice: ${gender}`);
    const audioBuffer = await generateTTS(text, voiceId);

    // Upload to S3
    console.log("Uploading audio to S3...");
    const audioUrl = await uploadAudioToS3(
      audioBuffer,
      `tts_${gender}`,
      brochureName
    );

    console.log(`Audio uploaded successfully: ${audioUrl}`);

    res.json({
      success: true,
      audioUrl: audioUrl,
      message: "TTS audio generated and uploaded successfully",
    });
  } catch (error) {
    console.error("Error in TTS API:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.post("/upload-file", upload.single("file"), async (req, res) => {
  try {
    const { brochureName } = req.body;
    const file = req.file;

    // Validation
    if (!brochureName || !brochureName.trim()) {
      return res.status(400).json({
        success: false,
        msg: "Brochure name is required",
      });
    }

    if (!file) {
      return res.status(400).json({
        success: false,
        msg: "File is required",
      });
    }

    // Clean brochure name
    const cleanBrochureName = brochureName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    console.log(
      `Uploading file ${file.originalname} for brochure: ${cleanBrochureName}`
    );

    // Upload file
    const uploadResult = await uploadFileToS3(file, cleanBrochureName);

    return res.status(201).json({
      success: true,
      msg: "File uploaded successfully",
      data: {
        brochureName: cleanBrochureName,
        file: {
          url: uploadResult.url,
          category: uploadResult.category,
          originalName: uploadResult.originalName,
          fileName: uploadResult.fileName,
          size: uploadResult.size,
          mimetype: uploadResult.mimetype,
          key: uploadResult.key,
        },
        uploadedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Single file upload error:", error);
    return res.status(500).json({
      success: false,
      msg: "Internal server error during file upload",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

export default router;
