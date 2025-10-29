require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { GoogleGenAI } = require("@google/genai");

// --- 1. MODEL IMPORTS (MUST BE SEPARATE FILES) ---
const User = require("./models/user");
const History = require("./models/history");

// --- 2. CONFIGURATION SETUP ---
const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// MongoDB Connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`\n✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
};
connectDB();

// Gemini API Client Initialization
if (!GEMINI_API_KEY) {
  throw new Error(
    "GEMINI_API_KEY is not defined in the environment variables."
  );
}
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const BASIC_MODEL = "gemini-2.5-flash-lite";

// --- MIDDLEWARE SETUP ---
app.use(express.json());
app.use(cookieParser());
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// --- 3. MIDDLEWARE DEFINITIONS (Protection & Metering) ---

// JWT Verification Middleware
const protect = async (req, res, next) => {
  let token;
  if (req.cookies.token) {
    token = req.cookies.token;
  }
  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Not authorized to access this route. Please log in.",
    });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("+password");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, error: "No user found with this ID." });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: "Not authorized, token failed or expired.",
    });
  }
};

// Credit Metering and Deduction Middleware
const meteringGate = async (req, res, next) => {
  const userId = req.user._id;

  try {
    const user = await User.findById(userId);

    if (user.credits <= 0) {
      return res.status(402).json({
        success: false,
        error: "OUT_OF_CREDITS",
        message:
          "Daily explanation limit reached. Please wait for the daily reset.",
        creditsRemaining: 0,
      });
    }

    // Deduct one credit before processing the request
    user.credits -= 1;
    await user.save();

    req.creditsRemaining = user.credits;
    next();
  } catch (err) {
    console.error("Metering Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Server error during credit check." });
  }
};

// auth controllers
const registerUser = async (req, res) => {
  const { username, email, password } = req.body;

  console.log("\n--- DEBUG: Register Attempt ---");
  console.log("Received Body:", req.body);

  if (!username || !email || !password) {
    res
      .status(401)
      .json({ success: false, error: "Please enter the credentials" });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    let user = await User.create({
      username,
      email,
      password: hashedPassword,
    });

    const payload = {
      id: user._id,
      role: user.role,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_LIFETIME,
    });

    const options = {
      expires: new Date(Date.now() + parseInt(process.env.JWT_LIFETIME_MS)),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    };

    res
      .status(201)
      .cookie("token", token, options)
      .json({
        success: true,
        token: token,
        data: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          credits: user.credits,
        },
      });
  } catch (err) {
    console.error("\n--- DEBUG: Registration Failed ---");
    console.error("Full Error Object:", err);

    if (err.code === 11000) {
      let field = err.message.includes("email") ? "Email" : "Username";
      return res
        .status(400)
        .json({ success: false, error: `${field} already registered.` });
    }

    // Mongoose validation errors often use err.errors or err.name
    if (err.name === "ValidationError" && err.errors) {
      console.error("Mongoose Validation Errors:", err.errors);
    }

    res.status(500).json({
      success: false,
      error: "Registration failed. Check server console for details.",
    });
  }
};

const loginUser = async (req, res) => {
  const { email, password } = req.body;

  console.log("\n--- DEBUG: Register Attempt ---");
  console.log("Received Body:", req.body);

  if (!email || !password) {
    return res
      .status(400)
      .json({ success: false, error: "Please provide an email and password." });
  }

  try {
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid email." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: "Invalid pass." });
    }

    const payload = {
      id: user._id,
      role: user.role,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_LIFETIME,
    });

    const options = {
      expires: new Date(Date.now() + parseInt(process.env.JWT_LIFETIME_MS)),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    };

    res
      .status(201)
      .cookie("token", token, options)
      .json({
        success: true,
        token: token,
        data: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          credits: user.credits,
        },
      });
  } catch (err) {
    console.error("\n--- DEBUG: Login Failed Internal Server Error ---");
    console.error("Full Login Error:", err);
    res.status(500).json({ success: false, error: "Login failed." });
  }
};

const logoutUser = (req, res) => {
  res.cookie("token", "none", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });
  res
    .status(200)
    .json({ success: true, data: "User logged out successfully." });
};

// To get the user profile
const getMe = async (req, res) => {
  const user = await User.findById(req.user.id);
  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      credits: user.credits,
    },
  });
};

// To get the user history
const getHistory = async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId);

    // Find the last 10 user history
    const history = await History.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(10);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          credits: user.credits,
        },
        history: history,
      },
    });
  } catch (error) {
    console.error("Error fetching user state:", error);
    res.status(500).json({
      success: false,
      error: "Could not retrieve user state or history.",
    });
  }
};

// Generate Explanation
const generateExplanation = async (req, res) => {
  const { code, language } = req.body;
  const user = req.user;
  const creditsRemaining = req.creditsRemaining;

  if (!code || !language) {
    return res
      .status(400)
      .json({ success: false, error: "Please provide code and language." });
  }

  const model = BASIC_MODEL;

  const systemPrompt = `You are an expert full-stack developer specializing in ${language}. Your task is to explain the user's ${language} code/query. Respond in clear, concise, and structured markdown. Do NOT include any conversational preamble ("Hello!", "Sure, I can explain that"). Just start with the explanation.`;
  const userPrompt = `EXPLAIN THIS: \n\n\`\`\`${language}\n${code}\n\`\`\``;
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  try {
    const responseStream = await ai.models.generateContentStream({
      model: model,
      contents: fullPrompt,
    });

    let fullExplanation = "";

    res.writeHead(200, {
      "Content-Type": "text/plain",
      "Transfer-Encoding": "chunked",
      Connection: "keep-alive",
      "X-Credits-Remaining": creditsRemaining.toString(),
    });

    for await (const chunks of responseStream) {
      res.write(chunks.text);
      fullExplanation += chunks.text;
    }

    res.end();

    await History.create({
      user: user._id,
      codeSnippet: code,
      language: language,
      explanation: fullExplanation,
      modelUsed: model,
    });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({
      success: false,
      error: "AI service unavailable. Please try again later.",
    });
  }
};

// Route Definitions
// Authentication
app.post("/api/auth/register", registerUser);
app.post("/api/auth/login", loginUser);
app.get("/api/auth/logout", logoutUser);

// Profile
app.get("/api/auth/me", protect, getMe);

// Explain
app.post("/api/explain", protect, meteringGate, generateExplanation);

// History
app.get("/api/user/history", protect, getHistory);

app.get("/", (req, res) => {
  res.send("AI Code Explainer API is running.");
});

app.listen(PORT, () => {
  console.log("localhost:3000 connected");
});
