import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const mongod = async () => {
  mongoose
    .connect(
      `mongodb+srv://krishna:FG6NzZuRuKSvAM3T@cluster0.bvjlzjn.mongodb.net/`
    )
    .then(() => {
      console.log("Connected to MongoDB");
    })
    .catch((error) => {
      console.error("Error connecting to MongoDB:", error);
    });
};

mongod();

//FG6NzZuRuKSvAM3T

// https://downloads.mongodb.com/compass/mongosh-2.5.1-x64.msi