const mongoose = require("mongoose");

const historySchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.ObjectId,
      ref: "user",
      required: true,
    },
    codeSnippet: {
      type: String,
      required: [true, "Query history must include the code snippet."],
    },
    language: {
      type: String,
      required: [true, "Query history must include the language."],
    },
    explanation: {
      type: String,
      required: [true, "Query history must include the explanation text."],
    },
    modelUsed: {
      type: String,
      enum: ["gemini-2.5-pro", "gemini-2.5-flash-lite"],
    },
  },
  {
    timestamps: true,
  }
);

module.export = mongoose.model("history", historySchema);