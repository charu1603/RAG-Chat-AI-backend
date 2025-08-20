import { Worker } from "bullmq";
import { QdrantVectorStore } from "@langchain/qdrant";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

const worker = new Worker(
  "file-upload-queue",
  async (job) => {
    console.log("Job", job.data);
    const data = JSON.parse(job.data);

    // Load PDF
    const loader = new PDFLoader(data.path);
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
        collectionName: "chat-ai",
      }
    );

    // Add docs
    await vectorStore.addDocuments(docs);
    console.log(`✅ All docs are added to vector store`);
  },
  {
    concurrency: 100,
    connection: {
      url: process.env.UPSTASH_REDIS_URL,
    },
  }
);

// Error handling
worker.on("error", (err) => {
  console.error("❌ Worker error:", err);
});
worker.on("failed", (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err);
});
