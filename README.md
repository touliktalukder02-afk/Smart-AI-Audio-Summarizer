# Smart AI Audio Summarizer

A React + Vite web application for browser-based audio transcription, AI summarization, summary translation, transcript search, and PDF export.

## Live links

- **Live website:** https://smart-ai-audio-summarizer.vercel.app/
- **GitHub repository:** https://github.com/touliktalukder02-afk/Smart-AI-Audio-Summarizer

## Main capabilities

- Upload a supported audio/video recording or record audio in the browser (actual supported formats depend on the browser and the selected file).
- Generate a timestamped transcript using a browser-compatible Whisper Small model through Transformers.js.
- Search transcript text and navigate between matches; timestamped segments can be used to seek through the media.
- Generate a summary using a browser-compatible summarization model. The implementation includes an extractive fallback if the model cannot be loaded or summarization fails.
- Translate summaries into German, Spanish, French, or Italian using browser-compatible OPUS-MT models.
- Export report content as PDF.
- Use Supabase authentication and save recording/transcript/summary metadata for signed-in users, subject to the configured Supabase database schema and Row Level Security (RLS) policies.

## Architecture at a glance

1. **React/Vite frontend** provides the user interface and development/build tooling.
2. **Transformers.js** loads browser-compatible ONNX model assets and runs speech recognition, summarization, and translation in the browser. The first use can download large model files; later loads may benefit from browser caching.
3. **Supabase** provides authentication and database access for user/profile and analysis-history metadata. The application code does not upload the raw recording as part of the transcription flow described in the source.
4. **jsPDF** supports PDF export. Browser media APIs support file playback and recording where the browser permits it.
5. **Vercel** hosts the deployed frontend. It is not a dedicated server-side inference service for these browser models.

## Requirements

- Node.js LTS and npm (npm is installed with Node.js).
- A modern browser (current Chrome or Edge recommended).
- Internet access for loading the website, Supabase services, and model files.
- Access to the project's Supabase configuration and a Supabase project whose database schema, authentication settings, and RLS policies match the application.

## Run locally

### 1. Extract and open the source folder

Open a terminal in `source_code/`, the directory containing `package.json`.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a local file named `.env.local` in `source_code/` by copying `.env.example`:

```bash
# Windows Command Prompt
copy .env.example .env.local

# PowerShell, macOS, or Linux
cp .env.example .env.local
```

Open `.env.local` and replace the placeholder values with the correct Supabase project URL and **publishable** key. Do not put a Supabase service-role key or any private server secret in a `VITE_` variable; Vite exposes `VITE_` values to client-side code.

### 4. Start the development server

```bash
npm run dev
```

Vite prints a local URL, normally `http://localhost:5173/`. Open that URL in your browser.

### 5. Build and preview

```bash
npm run build
npm run preview
```

The production build is written to `dist/`. This generated directory is intentionally excluded from source control and the submission ZIP.

## Environment variables

The application reads these variables from `import.meta.env`:

| Variable | Purpose | Required |
|---|---|---|
| `VITE_SUPABASE_URL` | URL of the Supabase project | Yes |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable/anon client key intended for browser use, protected by RLS policies | Yes |

A template is provided as `source_code/.env.example`. It contains placeholders only. Obtain values from the Supabase project's API/project settings or from the project's administrator.

## Important security notes

- Never commit `.env.local`, real credentials, Supabase service-role keys, database passwords, access tokens, or private API keys.
- The Supabase publishable key is used in browser code and is not a substitute for database security. Configure and test Row Level Security (RLS) policies for every exposed table.
- Do not disable RLS to make the application work.
- The example environment file is safe to share because it contains placeholders, not working credentials.
- Audio/model processing in this implementation is browser-based. Model files may be downloaded by the browser from the model host; consider download size, device memory, and browser capability when testing.

## Troubleshooting

- **Missing Supabase environment variables:** Confirm `.env.local` is in the same folder as `package.json`, has the exact variable names above, and restart `npm run dev` after editing it.
- **Supabase authentication/database errors:** Check that the Supabase project is active, authentication settings are configured, the required tables exist, and RLS policies permit the intended operations.
- **Model download or inference errors:** Confirm internet access, refresh the page, try a current Chrome/Edge browser, and check the browser console. First-time model downloads can take time and require substantial memory.
- **Microphone unavailable:** Grant microphone permission and use a secure context (localhost is normally treated as secure by browsers).
- **PDF export issues:** Try a current browser and check the console for errors.

## Project scripts

- `npm run dev` — run Vite development server.
- `npm run build` — create a production build.
- `npm run preview` — locally preview the production build.
- `npm run lint` — run ESLint checks.

## Notes for submission

This is the public web implementation. It uses pre-trained browser-compatible models declared in `src/lib/browserAi.js`; the repository does not establish that a separately trained summarizer adapter is used by this deployed web version. Do not describe the public website as fine-tuning Whisper or as using a server-side Groq/OpenAI API unless the implementation has been changed and verified.
