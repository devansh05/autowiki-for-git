import express from "express";

const app = express();

app.get("/", (req, res) => {
  res.json("Running on 3000");
});

app.get("/health", (req, res) => {
  res.json("Server healthy Running on 3000");
});

app.listen(3000, () => {
  console.log("📋 Running on 3000");
});
