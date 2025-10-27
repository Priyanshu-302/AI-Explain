require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { GoogleGenAI } = require("@google/genai");
const History = require("./models/history");
const User = require("./models/user");

const app = express();
const PORT = process.env.PORT || 5000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const connectDB = async () => {
  try {
    let conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`\n✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
};
connectDB();

if (!GEMINI_API_KEY) {
  throw new Error(
    "GEMINI_API_KEY is not defined in the environment variables."
  );
}
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const PRO_MODEL = "gemini-2.5-pro";
const BASIC_MODEL = "gemini-2.5-flash-lite";

app.use(express.json());
app.use(cookieParser());

// protected route for login/register
const protect = (req, res, next) => {
  try {
    let token = req.cookies.token;

    if (!token) {
      res.status(401).json({
        success: false,
        error: "Not authorized to access this route. Please log in.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: "Not authorized, token failed or expired.",
    });
  }
};

// metering and deduction middleware
const meteringGate = async (req, res, next) => {
  const userId = req.user._id;

  try {
    const user = await User.finfById(userId);

    if (user.credits <= 0) {
      return res.status(402).json({
        success: false,
        error: "OUT_OF_CREDITS",
        message:
          "Daily explanation limit reached. Please wait for the daily reset.",
        creditsRemaining: 0,
      });
    }

    user.credits -= 1;
    await user.save();

    req.creditsRemaining = user.credits;
    next();
  } catch (error) {
    console.error("Metering Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Server error during credit check." });
  }
};

// Auth Controllers
const registerUser = async (req, res) => {
  
}