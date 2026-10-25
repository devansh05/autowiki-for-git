import { Router } from "express";
import { inngest } from "../inngest/client.js";
import { parseRepo } from "../service/github.js";

const router = Router();

router.post("/", async (req, res) => {
  const githubToken = req.body?.githubToken || process.env.GITHUB_TOKEN;
  let repository;
  try {
    repository = parseRepo(req.body?.repo);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const { owner, repo, repoKey } = repository;

  await inngest.send({
    name: "repo/index.requested",
    data: { githubToken, owner, repo, repoKey },
  });

  res.json("Repo Indexing");
});

export default router;
