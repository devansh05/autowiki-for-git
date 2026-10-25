A NodeJS backend project to implement RAG on Github, with embeddings and similarity searches

Start Inngest locally
In a second terminal, point the Inngest development server at the Express handler:

npx inngest-cli@latest dev -u http://localhost:3001/api/inngest

The dashboard shows received events, individual processing steps, retries, and errors. Source imports will remain PENDING if events are not being processed.
