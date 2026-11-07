# YouTube Idea Engine (Zeecomedia)

Finds rising topics for your AI/tech/coding channel and has Gemini turn the best ones into video ideas.

## How it works
1. **Collect** (Mon + Thu 06:00 UTC, or the "Find new ideas" button):
   - Google Trends *related rising queries* on YouTube search, per seed topic (last 7 days)
   - YouTube search autocomplete for each seed + "tutorial / vs / free"
   - Google Trends "trending now" items that look tech-related
2. **Pick and write**: Gemini gets your channel profile (`netlify/lib/config.mjs`) plus the candidates, drops off-topic ones, and writes title, hook, thumbnail text, format, a Shorts angle and why-now.
3. **Show**: results are stored in Netlify Blobs and displayed by pillar.

## Google Trends data sources
- Google's official Trends API is an invite-only alpha (apply on Google's Trends API page). Not used.
- Default: unofficial direct calls to Trends' own JSON endpoints (what pytrends used; pytrends is archived). Free, but Google may answer 429 from cloud IPs. The code stops early if blocked and still returns YouTube-suggest and trending-now ideas.
- Reliable option: set `SERPAPI_KEY` (SerpApi's Google Trends engine, paid) and it is used automatically.

## Deploy
1. Push this folder to GitHub, then Netlify > Add new site > Import from Git.
2. Site settings > Environment variables:
   - `GEMINI_API_KEY` (free key from Google AI Studio)
   - optional `GEMINI_MODEL` (default `gemini-3.8-flash`)
   - optional `SERPAPI_KEY`
3. Deploy and open the site. Trending ideas generate automatically on the first visit (about a minute) and refresh when older than a day.
4. Type any topic in the box and press Enter (or **Search trends**) to get ideas for that topic. Results are cached for an hour per topic.

Note: the search endpoint is public, so anyone with your URL can use your Gemini quota. Keep the URL private or add a password under Netlify site protection.

Local: `npm i -g netlify-cli && npm i && netlify dev`

## Customize
Everything lives in `netlify/lib/config.mjs`: channel profile, pillars and seeds, countries (`GEOS`), time window, YouTube vs web search.

## Videos: ideas > render > Cloudinary > schedule > post > auto-delete
1. **Ideas tab:** tick the ideas you want (up to 20 at a time), choose **Daily time slots** (for example `09:00, 14:00, 19:00` for three posts a day, in your local time) or **Every N hours**, pick when to start, check the preview line, and click **Make videos**.
2. **Render (GitHub Actions):** the Motion Graphics Engine turns each idea into a finished Short (details below) and uploads it to **Cloudinary**. This is the only step that needs GitHub Actions, because Chrome and ffmpeg can't run on Netlify.
3. **Queue tab:** a summary at the top (how many are rendering, scheduled, posted or failed, what is due now, and the next scheduled video with a countdown), then one card per video with a timeline: sent for rendering, rendering started, rendered, scheduled time, posted time, and Cloudinary deletion, each with its time in your time zone. Each card also has a player, the script and an editable post time. Remove or retime anything before it goes out.
4. **Post (Netlify):** a scheduled function checks every 15 minutes and posts due videos to YouTube. Posting can be up to 15 minutes late. Right after a successful post, the video is **deleted from Cloudinary**. Videos that were rendered late are posted on the next check.

### The Motion Graphics Engine (worker/)
`planner -> voiceover -> audio -> Remotion`, all driven by one scene timeline so picture, voice and sound stay in sync.
1. **Scene script:** Gemini splits the idea into 5-7 scenes (1-2 spoken sentences each) with a headline, keywords, emphasis words and a suggested layout. If the layout is missing or repeats the previous scene, `worker/engine/planner.mjs` picks one from the keywords.
2. **Layouts:** kinetic typography (words pop in as they are spoken, emphasis words highlighted), concept scenes with an animated illustration chosen by keyword (brain/neural net, gears, code, video, chat, growth chart, rocket, shield, spark), animated UI mockups (chat, code editor, workflow, dashboard), numbered lists, and big-number stat scenes. Stat scenes only use numbers that appear in the narration, and dashboards show no invented figures.
3. **Transitions:** slide, slide-up, zoom, wipe, circle reveal, plus two 3D ones (a door-style swing and a top-hinged flip), rotated so neighbouring scenes differ.
3b. **3D and motion (CSS perspective transforms, no extra libraries):**
   - **3D illustrations:** a spinning glass cube whose faces show the scene's keywords (also the default when no keyword matches), solid 3D bars growing on a turning platform (money/sales words), and a glowing core with tilted rings and satellites orbiting in depth (AI/model/agent words). Flat illustrations (neural net, gears, code, video, chat, growth line, rocket, shield) sway in perspective over a soft shadow.
   - **Depth and camera:** every scene gets a slow 3D camera sway and push-in; backgrounds have parallax dust at different depths plus three tumbling wireframe cubes; spoken words fly in from the distance; headlines and emphasis words are extruded 3D text.
   - **Motion accents:** tilted UI mockups with a moving glare, list cards that flip down into place, confetti bursts on number reveals and the outro, and an outro cube showing your channel name.
   - **What this is not:** a WebGL scene with 3D models, real lighting and shadows. That would use `@remotion/three` and needs GPU flags and much slower rendering on GitHub's servers, so it is left out on purpose.
4. **Voiceover sync:** each scene is voiced with its own TTS call, so scene lengths match the speech exactly. Word highlights inside a scene are estimated from word length (TTS gives no word timestamps), so they can drift by a fraction of a second. If a scene's voice fails after retries, that scene renders silent with captions. Raise `TTS_DELAY_MS` (default 1500) if you hit TTS rate limits.
5. **Music and sound effects:** synthesized in code (no copyrighted audio). Every scene starts on a beat, with the tempo nudged per scene so a whole number of beats fits; a whoosh plays on each transition, a pop on each element reveal, an impact on the hook and stat reveals, and a chime on the outro. The music sits about 12 dB under typical speech.
6. **Make it yours:** colors come from `pickTheme` in the planner; add illustrations in `worker/remotion/engine/motifs.js` and UI mockups in `ui.js`, then add the keywords that trigger them in `planner.mjs`.

### One-time setup
1. **Cloudinary:** create a free account and copy the cloud name, API key and API secret from the dashboard.
2. **Google Cloud (YouTube sign-in):**
   - Create a project and enable **YouTube Data API v3**.
   - OAuth consent screen: choose External, fill in the basics, add the scope `.../auth/youtube.upload`, and **publish the app to production**. In Testing mode Google expires the connection after about 7 days. Unverified production apps show a "Google hasn't verified this app" screen; click Advanced, then continue. That is fine for your own account.
   - Credentials > Create OAuth client ID > **Web application**. Under Authorized redirect URIs add `https://YOUR-SITE.netlify.app/api/youtube/callback` (the Queue tab also shows the exact address). Copy the client ID and secret.
3. **GitHub repo > Settings > Secrets and variables > Actions** (render step): secrets `GEMINI_API_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `NETLIFY_URL` (e.g. https://yoursite.netlify.app), `WORKER_SECRET` (any long random string). Optional variable `CHANNEL_NAME` (shown on the video).
4. **Netlify env vars** (scheduling and posting): `GEMINI_API_KEY`, `GITHUB_TOKEN` (fine-grained token for this repo, Contents: read and write), `GITHUB_REPO` (`owner/name`), `WORKER_SECRET` (same value as in GitHub), `ADMIN_PASSWORD` (protects Make, Post, Remove, Connect and Disconnect, strongly recommended), the three `CLOUDINARY_*` values, and `YT_CLIENT_ID` and `YT_CLIENT_SECRET` from step 2. Optional: `YT_PRIVACY` (`public` by default, or `unlisted` / `private`), `SITE_URL` (only if you use a custom domain, so the redirect address matches), `TOKEN_SECRET` (a separate key for encrypting the YouTube token; defaults to `WORKER_SECRET`). Redeploy after saving.
5. **Connect YouTube:** open the Queue tab, click **Connect YouTube**, sign in with the Google account that owns the channel (pick the right channel if you have several) and tick the upload permission.

### How the YouTube connection works
- The app asks only for permission to **upload** videos, plus your email so the Queue can show which account is connected. It cannot read, edit or delete your existing videos or comments.
- The long-lived token is encrypted (AES-256-GCM) before it is stored in Netlify Blobs, and it is never sent to the browser. Connect and Disconnect need your `ADMIN_PASSWORD`, so nobody else can switch the app to their channel.
- If the connection is revoked or expires, posts fail with a clear message, the Queue shows **Reconnect YouTube**, and **Retry** posts the video afterward. Changing `WORKER_SECRET` (or `TOKEN_SECRET`) makes the stored token unreadable, so reconnect if you change it.
- **Disconnect** revokes the token at Google and deletes it here. You can also remove the app any time at myaccount.google.com/permissions.
- Older setups can keep using a `YT_REFRESH_TOKEN` env var; the Queue labels that case. A token saved through Connect takes priority.

### Architecture principles (and where each one lives)
1. **Gemini is the preferred AI provider.** Scripts and ideas use `GEMINI_API_KEY` first (`netlify/lib/llm.mjs`). Voiceover is Gemini text-to-speech.
2. **Groq is the first fallback**, then 3. **Hugging Face is the second.** If Gemini is busy or down (tried twice with a pause), the same request goes to Groq (`GROQ_API_KEY`, model `llama-3.3-70b-versatile`), then Hugging Face (`HF_TOKEN`, model `openai/gpt-oss-120b:fastest`, a token with the "Make calls to Inference Providers" permission). Providers without a key are skipped. Optional: `LLM_PROVIDERS` reorders the chain, `GEMINI_FALLBACK_MODELS` adds other Gemini models before Groq, `GROQ_MODEL` and `HF_MODEL` change models. Put the Groq and Hugging Face keys in both Netlify and GitHub Actions. The video's Queue card shows which provider wrote the script.
4. **Google Trends is a core signal.** Every refresh asks Google Trends for rising searches on YouTube. The last good result is saved; if Google blocks the request, that saved data (up to 7 days old) is used and clearly labelled, and the Ideas page shows "Google Trends: live", "using saved data from 2d ago" or "unavailable". `SERPAPI_KEY` gives the most reliable data.
5. **GitHub Actions renders the video**, 6. **with Remotion** (`worker/`, `.github/workflows/render-clips.yml`).
7. **AI-generated production data is saved before rendering.** The storyboard and script are saved the moment they are written, and each scene's voice recording and generated image are saved the moment they exist, to Netlify (`yt-production` store). Before the render starts, everything is pushed to Netlify again as a safety check.
8. **Failed jobs resume without repeating successful stages.** The stages are storyboard and script, voiceover (scene by scene), scene images (one by one), render, upload. Retry (the **Retry (continue)** button, or the automatic retry after a temporary provider problem) reads the saved data and skips every stage that finished: a saved script is not re-written, saved voice scenes are not re-recorded, saved images are not re-generated (only missing ones are tried again), and only the failed stage onward runs. **Start over** discards the saved data and rebuilds from scratch. If only the upload failed, a retry in the same run re-uploads without re-rendering. Saved data is deleted when the video is posted or removed, and the raw voice recordings are deleted once the video is ready. The Queue card shows the current stage and what has been saved.

### Storyboards (Gemini) and scene images (Stable Diffusion)
- **Storyboard:** for every scene Gemini writes what the viewer sees (`visual`) and a picture prompt (`imagePrompt`), plus one `visualStyle` for the whole video so the images match. The storyboard shows on each Queue card under "Script and details".
- **Images:** each scene's prompt (subject + shared art direction + "no text, no logos, no real people") goes to **Stable Diffusion**: first **Stability AI**'s own API (`STABILITY_API_KEY`; model `core` by default, or `ultra`, `sd3.5-large`, ... via `STABILITY_MODEL`), then **Stable Diffusion hosted on Hugging Face** (`HF_TOKEN`; model `stabilityai/stable-diffusion-xl-base-1.0` by default, change with `HF_IMAGE_MODEL`). 9:16 images are used as a slowly drifting, darkened background behind each scene's animation.
- **Best effort:** if a scene's image can't be made (no credits, prompt refused, both providers down), that scene keeps the code-drawn graphics and the video still renders. With no image keys at all, images are simply off. `IMAGE_PROVIDERS` reorders the chain and `IMAGES=off` switches images off.
- Add `STABILITY_API_KEY` as a **GitHub Actions secret** (images are made in the render step, so Netlify does not need it). Image generation uses credits or quota on your Stability/Hugging Face account: about one image per scene, 5 to 7 per video, so check their pricing. Hugging Face's free provider may not serve every model; if the default fails, try another with `HF_IMAGE_MODEL`.
- Review generated images like scripts: AI images can contain odd details. The prompts ask for no text and no real people.

### Reliability: busy servers and dropped connections
- **Temporary problems** (busy servers, rate limits, dropped or hung connections) are retried automatically: first inside the provider chain, then by the worker, which waits 90 seconds, then 3 minutes, and continues from the saved progress before marking the card Failed. Other problems (bad key, rejected upload) fail immediately with the reason.
- **Time limits** on every outside call (script 60 s, voice 90 s, Hugging Face 90 s, Cloudinary upload 5 min, YouTube upload 10 min) so nothing hangs. Errors name the service, for example "Cloudinary upload could not connect (ECONNRESET)".
- **No silent videos:** if a scene can't be voiced, the render retries or fails instead of posting narration with gaps (`ALLOW_SILENT=1` overrides this).
- After a failed render, **Retry** moves the post time at least 45 minutes ahead so the video doesn't post the moment it finishes.

### Things to know
- **Review scripts.** They are AI-written from your idea and may contain mistakes. The Queue lets you read each script and watch each video before it posts.
- **Private until audited:** uploads from a new API project are forced private by YouTube until Google audits it, whatever `YT_PRIVACY` says. You can flip them public in YouTube Studio.
- **How many a day:** Google's current default is 100 YouTube uploads per project per day (older articles say about 6; that was the pre-2026 rule), so 3 a day is far below the limit. The real limits are elsewhere: render time (roughly 5-15 minutes per video, so 3 a day is under an hour of GitHub time; private repos get 2,000 free minutes a month, public repos are unlimited), Gemini voice (TTS) quota (about 6 calls per video; if you hit limits, raise `TTS_DELAY_MS` or enable billing on your Gemini key), and YouTube's own per-channel upload limits, which are not published precisely. Large requests are split into render runs of 5 videos that run in parallel. If YouTube refuses an upload, the card shows the reason and **Retry** posts it later.
- **Render time:** several minutes per 40-second Short on a GitHub runner. Public repos get free minutes; private repos have a monthly allowance.
- **Rendering is heavier now:** expect roughly 5-15 minutes per Short on a GitHub runner, and one TTS call per scene.
- **Not yet seen in a real render:** the engine's code was tested with stand-ins for Remotion, not a live Chrome render. Check the first video in the Queue before you trust it, and tell me what looks off.
- **Remotion license:** free for individuals and teams of up to 3 people; larger companies need a paid license (remotion.dev/license).
- The earlier "analyze a YouTube video for clips" tab was removed in this version, since ideas now drive the videos.


### Free-tier quotas, Retry delay and live Queue (read this if you run on free AI keys)
- **Daily quota is parked, not waited out.** Free Gemini voice has a small *per-day* limit (for example 10 requests/day on one model, and a video needs one request per scene). When it is used up, the worker no longer sleeps for hours inside GitHub Actions: the job is **saved and parked**, the Queue card says *"AI quota used up. Resumes by itself"* with the time, and `dispatch-due` (every 5 minutes) restarts it from the saved script and voice when the quota resets. Other videos in the same run are parked too instead of hitting the same wall. **Start now** skips the wait.
- **Voice model fallback.** Every Gemini model has its own quota. `GEMINI_TTS_MODEL` (default `gemini-3.1-flash-tts-preview`) is tried first, then `GEMINI_TTS_FALLBACK_MODELS` (default `gemini-2.5-flash-preview-tts`, comma separated, `none` to disable). Set them as GitHub *variables*. Check your limits at https://ai.google.dev/gemini-api/docs/rate-limits. A video can mix two models' voices if the first runs out halfway; keep one model if you prefer a uniform voice.
- **Retry waits first.** Pressing Retry schedules the render `RETRY_DELAY_MIN` minutes ahead (Netlify variable, default 5) instead of starting instantly, and never before a known quota reset. The post time moves after the render can finish. Short per-minute limits (up to 2 minutes) are waited out inside the run; `TTS_DELAY_MS` (default 1500) spaces voice calls.
- **The Queue tab updates by itself.** Clicks (Retry, Save time, Post now, Remove, Start now) change the card instantly and roll back with the server's message if refused; the page re-checks every 3s while something is happening, every 10s when quiet (30s after 5 idle minutes) and pauses in a background tab. A check only reads one small revision marker, so it stays cheap on the Netlify free plan. Open details panels, playing videos and a time you are typing are left alone.
- **Tests:** `cd worker && npm test` (planner shapes, quota parsing, voice-model fallback).


### Troubleshooting: a video says "Waiting for the render server" or never reaches "posted"
The Queue card now shows a progress bar, the time of the last update from the render server (it sends a heartbeat every minute) and a link to the GitHub run.
- **Queued (2 of 3 in this run):** the run has started and this video is waiting its turn (videos in one run render one after another).
- **Waiting for the render server to start:** normal for 1 to 2 minutes. After 10 minutes the card turns red; after 30 minutes (`RENDER_START_TIMEOUT_MIN`) it is marked **Failed** with the likely cause. Open GitHub > Actions > Render videos. Usual causes: the workflow file is not on the repo's default branch, a setup step failed, or the `NETLIFY_URL` / `WORKER_SECRET` secrets in GitHub are missing or don't match Netlify.
- **No update for 20 minutes** (`RENDER_STALL_TIMEOUT_MIN`) while rendering: the run probably crashed or was cancelled; the card is marked Failed. Press **Retry**: it continues from the saved script, voice and images.
- The worker now stops with a red GitHub run (instead of silently rendering videos that can never post) when `NETLIFY_URL` is missing, the secret doesn't match, or Netlify can't be reached. A failed or cancelled run also reports itself to the Queue through `worker/fail-report.mjs`.
- `NETLIFY_URL` may be written with or without a trailing slash.
