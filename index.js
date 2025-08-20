import express from "express";
import cors from "cors";
import multer from "multer";
import { Queue } from "bullmq";
import { QdrantVectorStore } from "@langchain/qdrant";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import dotenv from "dotenv";
import { storage } from "./cloudinaryConfig.js";
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || "";
const apiUrl = process.env.GEMINI_API_URL + apiKey;

const queue = new Queue("file-upload-queue", {
  connection: {
    url:  process.env.UPSTASH_REDIS_TCP_URL,
  },
});

const upload = multer({ storage });

const app = express();
app.use(cors());

app.get("/", (req, res) => res.json({ status: "done" }));

app.post("/upload/pdf", upload.single("pdf"), (req, res) => {
 queue.add("file-ready", JSON.stringify({
    filename: req.file.originalname,
    url: req.file.path, // Cloudinary URL
  }));

  console.log("Uploaded file info:", req.file);
  return res.json({ message: "uploaded", url: req.file.path });
});
const embeddings = new GoogleGenerativeAIEmbeddings({
  model: "embedding-001",
  apiKey: process.env.GEMINI_API_KEY,
});
app.get("/chat", async (req, res) => {
  try {
    const userQuery = req.query.message;
    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        url: process.env.QDRANT_API_URL,
        apiKey: process.env.QDRANT_API_KEY,
        collectionName: "chat-testing",
      }
    );

    const ret = vectorStore.asRetriever({ k: 2 });
    const result = await ret.invoke(userQuery);

    const SYSTEM_PROMPT = `You are a helpful AI assistant who answers the user query using the available context from PDF files.
Context: ${JSON.stringify(result)}
`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${SYSTEM_PROMPT}\n\n${userQuery}` }],
          },
        ],
      }),
    });

    const resultgemini = await response.json();
    console.log("Gemini raw response:", JSON.stringify(resultgemini, null, 2));

    let reply = "Sorry, I couldn't generate a response.";
    if (
      resultgemini.candidates &&
      resultgemini.candidates[0]?.content?.parts?.[0]?.text
    ) {
      reply = resultgemini.candidates[0].content.parts[0].text;
    }

    return res.json({
      response: reply,
      docs: result,
    });
  } catch (err) {
    console.error("Error in /chat:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.listen(8000, () => console.log("server running on 8000"));
