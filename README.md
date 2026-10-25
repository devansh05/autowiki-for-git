# AutoWiki for Git

A Node.js backend for asking questions about GitHub repositories using retrieval-augmented generation (RAG). It fetches repository files, splits them into chunks, stores embeddings in Pinecone, and uses relevant chunks to generate answers with source file paths.

The current project provides an Express API and background jobs. There is no web UI or generated wiki page. Indexing and question answering run asynchronously through Inngest; results are available in the Inngest dashboard.

## How it works

1. Send a repository to `POST /api/index`.
2. Inngest runs `index-repo`: fetch eligible files from the repository's default branch using the GitHub API, split them into chunks, generate OpenAI embeddings, and upsert them into Pinecone.
3. Send a question about that repository to `POST /api/chat`.
4. Inngest runs `ask-question`: embed the question, retrieve the five most similar chunks, and ask `gpt-4o-mini` to answer using that context.
5. View the answer and source file paths in the completed Inngest run.

| Component | Used for |
| --- | --- |
| Express 5 | HTTP routes and the Inngest handler |
| Inngest | Background jobs, processing steps, and execution history |
| Octokit | Repository metadata, file trees, and file contents from GitHub |
| LangChain | Text splitting, OpenAI embeddings, and chat model calls |
| OpenAI `text-embedding-3-small` | Embeddings for code chunks and questions |
| Pinecone | Vector storage and similarity search |
| OpenAI `gpt-4o-mini` | Answers based on retrieved repository content |

## Prerequisites

- Node.js **22 or newer** and npm. Some locked dependencies require Node.js 22.
- An OpenAI API key with access to the embedding and chat models above.
- A Pinecone account, API key, and an existing dense vector index.
- A GitHub token with access to the repository for private repositories or authenticated GitHub API requests. Public repositories can be fetched without a token, subject to GitHub's API limits.

Repository text is sent to OpenAI for embeddings and answer generation, and chunks are stored as metadata in Pinecone. These services require network access and may incur charges.

## Installation

```bash
git clone https://github.com/devansh05/autowiki-for-git.git
cd autowiki-for-git
npm ci
```

### 1. Create a Pinecone index

Create an index with these settings before running indexing jobs:

| Setting | Value |
| --- | --- |
| Name | `git-wiki` (or your own name via `PINECONE_INDEX`) |
| Vector type | Dense, with vectors supplied by the application |
| Dimensions | `1536` |
| Similarity metric | Cosine |

The application creates embeddings itself and does not create the Pinecone index. The dimensions match the default output of `text-embedding-3-small`; see the [OpenAI embeddings guide](https://developers.openai.com/api/docs/guides/embeddings).

### 2. Configure environment variables

Create a `.env` file in the project root and replace the placeholder values:

```dotenv
OPENAI_API_KEY=your_openai_api_key
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX=git-wiki
GITHUB_TOKEN=your_github_token
INNGEST_DEV=1
```

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Required for embeddings and answer generation. |
| `PINECONE_API_KEY` | Required to access Pinecone. |
| `PINECONE_INDEX` | Optional index name; defaults to `git-wiki`. |
| `GITHUB_TOKEN` | Default GitHub token for indexing; a request's `githubToken` overrides it. Omit it for unauthenticated access to public repositories. |
| `INNGEST_DEV` | Set to `1` for the local Inngest development server. |

Use the exact name `GITHUB_TOKEN`; the code does not read `GITHUB_PAT`. For a fine-grained token, include the target repository and allow reading its contents. `.env` is ignored by Git; keep real credentials out of commits.

### 3. Start the API

In your first terminal:

```bash
npm run dev
```

The API listens at **http://localhost:3000**. The port is currently hardcoded in `src/index.js`; setting `PORT` does not change it. Nodemon restarts the server when files change.

### 4. Start Inngest

In a second terminal:

```bash
npx --ignore-scripts=false inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Open **http://localhost:8288** to inspect registered functions, events, processing steps, errors, and run results. Keep both processes running. The API queues work; Inngest must be running to execute it. See the [Inngest local development guide](https://www.inngest.com/docs/local-development).

## Usage

### Check the server

```bash
curl http://localhost:3000/
```

Expected response: `hello world`.

### Index a repository

```bash
curl -X POST http://localhost:3000/api/index \
  -H 'Content-Type: application/json' \
  -d '{"repo":"devansh05/autowiki-for-git"}'
```

The API returns HTTP `200` with the JSON string `"Repo Indexing"` once the event has been sent. This does not mean indexing has finished. Open the `index-repo` run in Inngest and wait for it to complete before asking questions. Its output includes `repo`, `fileCount`, `chunkCount`, and `saved`.

The `repo` field accepts `owner/repository` or a GitHub URL such as `https://github.com/devansh05/autowiki-for-git`, with an optional `.git` suffix. Use the repository root, without branch or file paths.

You can override the default GitHub token in the JSON body:

```json
{
  "repo": "owner/private-repository",
  "githubToken": "your_github_token"
}
```

The selected token is included in the indexing event sent to Inngest, including when it comes from `GITHUB_TOKEN`.

### Ask a question

```bash
curl -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"repo":"devansh05/autowiki-for-git","question":"How does repository indexing work?"}'
```

The API returns HTTP `202` with the JSON string `"check your inngest "`. Open the completed `ask-question` run in Inngest to read its output. The shape is:

```json
{
  "repo": "devansh05/autowiki-for-git",
  "question": "How does repository indexing work?",
  "status": "completed",
  "answer": "<generated answer based on retrieved repository chunks>",
  "sources": ["<source file path>"]
}
```

If no indexed content is found, the job returns `"No indexed content was found for this repo. Index it first, then try again."` with an empty `sources` array. There is currently no result polling endpoint, streaming response, or stored chat history.

## API reference

| Method | Route | Request body | Behavior |
| --- | --- | --- | --- |
| `GET` | `/` | None | Returns `hello world`. |
| `POST` | `/api/index` | `repo`, optional `githubToken` | Sends `repo/index.requested`; returns `200` on event submission. |
| `POST` | `/api/chat` | `repo`, `question` | Sends `chat/question.requested`; returns `202` on event submission. Missing fields return `400`. |
| Inngest SDK | `/api/inngest` | Managed by Inngest | Registers and executes background functions. |

## Project structure

```text
src/
├── index.js                       # Express app, port, and route registration
├── routes/
│   ├── index.routes.js             # Repository indexing endpoint
│   └── chats.routes.js             # Question submission endpoint
├── service/
│   ├── github.js                  # Repository parsing, GitHub fetching, file filters
│   ├── chunker.js                 # Text splitting and file metadata
│   ├── vector-store.js            # Embeddings, Pinecone upserts, similarity search
│   └── rag.js                     # Context assembly, answer generation, source paths
└── inngest/
    ├── client.js                  # Main Inngest client (autowiki-github)
    ├── index.js                   # Alternate indexing router; not mounted by the app
    └── functions/
        ├── index.js               # Registered background functions
        ├── index-repo.js          # Fetch → chunk → embed and save
        ├── ask-questions.js       # Retrieve context → generate answer
        └── sample-function.js     # Demo job triggered by test/sample.function
```

## Current behavior and limits

- Indexing reads the **default branch** and stops after **200 eligible files**. There is no branch selector or automatic sync after pushes.
- The fetcher skips files larger than **200,000 bytes**, common dependency/build directories, listed media and binary extensions, lockfiles, source maps, and `.min.js` files. The exact filters are in `src/service/github.js`.
- Chunks use a **1,000-character** target size with **150 characters** of overlap. Each chunk retains its repository and file path.
- Pinecone namespaces replace the `/` in `owner/repository` with `-`. Different repository names can produce the same namespace, so this is not a strict isolation boundary.
- Records use deterministic IDs based on the repository, file path, and content, and are upserted in batches of 100. Reindexing unchanged chunks updates existing records; changed or deleted content can leave old records behind because there is no cleanup step.
- Answers use up to five retrieved chunks and include distinct source file paths, without line numbers. The prompt asks the model to use repository context only; coverage depends on which files and chunks were indexed and retrieved.
- The HTTP API has no authentication, and repository input validation is limited. The GitHub fetcher does not specifically exclude secret files such as `.env`. Review access controls and file filtering before exposing the service or indexing sensitive repositories.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Events fail to send or jobs do not run | Set `INNGEST_DEV=1`, run both processes, and point the Inngest CLI at `http://localhost:3000/api/inngest`. |
| GitHub reports a repository was not found | Check `owner/repository`, repository access, and token permissions. Fine-grained tokens must include the target repository. |
| GitHub token appears to be ignored | Use `GITHUB_TOKEN` in `.env` or `githubToken` in the indexing request. |
| Pinecone index or dimension error | Create the index first, verify `PINECONE_INDEX`, and use 1,536 dimensions for the configured embedding model. |
| Chat reports no indexed content | Wait for `index-repo` to finish successfully and use the same repository identifier in both requests. |
| OpenAI or Pinecone requests fail | Check the failed Inngest step, API keys, account access, quotas, and network connectivity. |

## Development

`npm run dev` runs the server with Nodemon. To run it directly without file watching:

```bash
node src/index.js
```

There is no build step. `npm test` is currently a placeholder that exits with an error; no automated test suite is configured. For a manual smoke check, start both services, check `GET /`, index a small repository, and submit a question after indexing completes.

## License

`package.json` declares the ISC license. A separate license file is not currently included.
