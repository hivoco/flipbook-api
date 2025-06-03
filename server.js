import express from "express";
import "./init.js";
import Brochures from "./router/brochures.js";
import Medialink from "./router/medialink.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express()
// app.use((req, res, next) => {
//   const allowedOrigins = [
//     "http://localhost:3000",
//     "http://localhost:5173",
//   ];
//   const origin = req.headers.origin;

//   if (allowedOrigins.includes(origin)) {
//     res.setHeader("Access-Control-Allow-Origin", origin);
//     res.setHeader("Vary", "Origin"); // Add this line
//     res.setHeader(
//       "Access-Control-Allow-Methods",
//       "GET, POST, PUT, DELETE, OPTIONS"
//     );
//     res.setHeader(
//       "Access-Control-Allow-Headers",
//       "Content-Type, Authorization"
//     );
//     res.setHeader("Access-Control-Allow-Credentials", true);
//   }

//   // Handle preflight requests (for non-simple requests like PUT, DELETE, etc.)
//   if (req.method === "OPTIONS") {
//     return res.status(200).end();
//   }

//   next();
// });

const PORT = process.env.PORT || 5000;
app.use(express.json());
app.use("/brochure", Brochures);
app.use("/link", Medialink);

app.get("/", async (req, res) => {
  try {
    return res.status(200).send({ msg: "API Working" });
  } catch (error) {
    console.error(error);
    return res.status(500).send({ msg: "Internal Server Error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
