import express from "express";
import "dotenv/config";
import { inngest, functions } from "./inngest/index.js";
import { serve } from "inngest/express";
const app = express();

app.use(express.json());

// Set up the "/api/inngest" (recommended) routes with the serve handler
app.use("/api/inngest", serve({ client: inngest, functions }));

app.get("/", (req, res) => {
  res.json("Running on 3000");
});

app.get("/health", (req, res) => {
  res.json("Server healthy Running on 3000");
});

app.listen(3000, () => {
  console.log("📋 Running on 3000");
});
