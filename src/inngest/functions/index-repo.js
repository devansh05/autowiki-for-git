import { NonRetriableError } from "inngest";
import { inngest } from "../client.js";
import { fetchRepoFiles, parseRepo } from "../../services/github.js";
import { chunkFiles } from "../../services/chunker.js";
import { saveChunks } from "../../services/vector-store.js";

export const indexRepo = inngest.createFunction(
  { id: "index-repo", triggers: [{ event: "repo/index.requested" }] },
  async ({ event, step }) => {
    const {
      githubToken,
      owner: eventOwner,
      repo,
      repoKey: eventRepoKey,
    } = event.data ?? {};

    let repository;
    try {
      repository = parseRepo(
        eventOwner && typeof repo === "string"
          ? `${eventOwner}/${repo}`
          : repo ?? eventRepoKey,
      );
    } catch {
      throw new NonRetriableError(
        'Invalid repo/index.requested data: provide { owner: "owner", repo: "repo" }, { repo: "owner/repo" }, or { repoKey: "owner/repo" }.',
      );
    }
    const { owner, repo: repoName, repoKey } = repository;

    const files = await step.run("fetch-github-files", async () => {
      return fetchRepoFiles(githubToken, owner, repoName);
    });

    const documents = await step.run("chunk-files", async () => {
      return chunkFiles(files, repoKey);
    });

    const saveResult = await step.run("save-to-pinecone", async () => {
      return saveChunks(repoKey, documents);
    });

    return {
      repo: repoKey,
      fileCount: files.length,
      chunkCount: documents.length,
      saved: saveResult.saved,
    };
  },
);
