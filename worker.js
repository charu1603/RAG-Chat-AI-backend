import { Worker } from "bullmq";
import { QdrantVectorStore } from "@langchain/qdrant";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import axios from "axios";
import fs from "fs";

const worker = new Worker(
  "file-upload-queue",
  async (job) => {
    const data = JSON.parse(job.data);
    console.log("Job data:", data);

    // Download PDF from Cloudinary to /tmp
    const filePath = `/tmp/${data.filename}`;
    const response = await axios.get(data.url, { responseType: "arraybuffer" });
    fs.writeFileSync(filePath, response.data);

    // Load PDF
    const loader = new PDFLoader(filePath);
    const docs = await loader.load();

    // Gemini embeddings
    const embeddings = new GoogleGenerativeAIEmbeddings({
      model: "embedding-001",
      apiKey: process.env.GEMINI_API_KEY,
    });

    // Qdrant Vector Store
    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        url: process.env.QDRANT_API_URL,
        apiKey: process.env.QDRANT_API_KEY,
        collectionName: "chat-testing",
      }
    );

    // Add docs to vector store
    await vectorStore.addDocuments(docs);
    console.log("All docs added to vector store");
  },
  {
    concurrency: 100,
    connection: { url: process.env.UPSTASH_REDIS_TCP_URL },
  }
);

worker.on("error", (err) => console.error("Worker error:", err));
worker.on("failed", (job, err) => console.error(`Job ${job.id} failed:`, err));
