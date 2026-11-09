# My Assistant (v0.2)

An Android assistant app. You add your own keys in Settings. Nothing is sent anywhere except to the services you set up.

## What works in this version

| Tab | What it does |
| --- | --- |
| Chat | Talk to Groq or Google Gemini. Writing modes: Assistant, Email, Social post, Story / script. Copy replies, save a reply as a task, tap Remember under your own message. Saved history on the phone. |
| Research | Searches the web with Tavily, then your AI writes an answer from the results. Each [number] points at a real source listed below the answer. Fake citation numbers are removed and you are warned. |
| Reply | Paste a message you received (WhatsApp, SMS, email), pick a tone, get a draft reply. You copy it and send it yourself. Nothing is sent from the app. |
| Tasks | Add tasks with a priority and an optional reminder (in 1 hour, this evening, tomorrow morning, or a custom time). "Plan my day with AI" turns your open tasks into a plan. |
| Memory | Things the assistant remembers about you. Only saved when you type them or tap Remember. Edit, delete, delete all, or switch memory off. Passwords and API keys are refused. |

Settings has a Test key button for your AI key and your Tavily key.

## What is NOT in this version

Voice, reading your email inbox, WhatsApp automation, calls, calendar, and share-sheet sending (you paste into the Reply tab instead). There are no buttons for these yet.

## What was tested and what was not

Tested (77 automated tests in Node with fake providers, plus a syntax check of every file and a check that every file import resolves):
- AI client: success, bad key, rate limit, unknown model, timeout, no internet, empty reply, key never in a URL or error message
- Storage: keys, settings, chat history (caps, corrupt data)
- Tasks and reminders: sorting, grouping, time parsing, notification scheduling with a fake notification module (permission denied, scheduling failure, complete, edit, delete)
- Memory: consent rules, secret refusal, caps, edit and delete, prompt building
- Reply drafting: input checks, prompt contents, injection stays inside markers
- Research: search errors, query planning, source de-duplication, citation checking, partial failures, keys never reach the model

NOT tested:
- The app itself has never been built or run. This workspace has no Android SDK and cannot install packages.
- Screens, keyboard behaviour, secure storage, clipboard, links and Alerts have never run on a phone.
- Real reminders: scheduling goes through expo-notifications, which was only tested with a fake. Android battery saver may delay reminders. Whether they survive a phone restart is unchecked.
- No real call to Groq, Gemini or Tavily has been made. Tavily's request format was read from its older REST docs page and may differ slightly from the live service.
- The GitHub Actions workflow has never run. `package.json` uses `latest` for every package and the workflow runs `npx expo install --fix` to align them.

Expect to fix something on the first build. If it fails, send me the red error text from the Actions log.

## Free or paid

- Groq and Google Gemini: I have not checked either provider's current free limits or whether they cover your country. Google's pricing page (read 2026-11-08) lists `gemini-3.8-flash` as free-tier for text, which is why it is the default. Check both sites before relying on them.
- Tavily (Research): its pricing and help pages (read 2026-11-08) say the free plan has 1,000 credits a month with no card, and a basic search costs 1 credit. A research run uses 1 to 3 credits.
- Google's search-grounding feature for Gemini is NOT used: its pricing page says it is not available on the free tier.
- Default model names are `llama-3.3-70b-versatile` (listed as a production Groq model on 2026-11-08) and `gemini-3.8-flash`. If one is rejected, type a current name in Settings.

## First run

1. Install the APK, open the app, go to Chat, then Settings.
2. Pick a provider, paste its key, tap Save key, then Test key.
3. Optional, for Research: paste a Tavily key and tap Test key.
4. Send a message in Chat. A reply means a real model answered.
5. Allow notifications when the Tasks tab asks, then add a task with a reminder 1 hour from now.

## Run the tests (Node 22)

```
npm test
```

## Build the APK from your phone

1. Put this project in a new **private** GitHub repository.
2. In the repo open **Actions**, choose **Build APK**, tap **Run workflow**.
3. When it turns green, open the run and download the **my-assistant-apk** artifact (a zip). Extract it in your Files app.
4. Open the APK and allow installing from this source when Android asks.

The phone browser cannot upload folders. Either ask Claude to create the repository and upload the files for you, or in GitHub tap **Add file, Create new file** and type each path as the file name (typing `src/ai.js` creates the folder). Files needed:

```
index.js  App.js  app.json  babel.config.js  package.json  .gitignore  README.md
src/ai.js  src/store.js  src/prompts.js  src/theme.js
src/tasks.js  src/reminders.js  src/memory.js  src/reply.js  src/research.js
src/components/Button.js  src/components/KeySection.js  src/components/TabBar.js
src/screens/ChatScreen.js  src/screens/HistoryScreen.js  src/screens/SettingsScreen.js
src/screens/TasksScreen.js  src/screens/MemoryScreen.js  src/screens/ReplyScreen.js  src/screens/ResearchScreen.js
test/ai.test.js  test/store.test.js  test/tasks.test.js  test/memory.test.js  test/reply.test.js  test/research.test.js
.github/workflows/build-apk.yml
```

## Your keys and your data

- Keys are stored in Android's secure storage on this phone and sent only to the service they belong to, in a request header (Tavily also accepts it in the request body). They are never written into the code or the repo.
- Chats, tasks and memories are saved on this phone only.
- Your messages, and saved memories while memory is on, are sent to your chosen AI provider. Research questions are also sent to Tavily; memories never are.
- Web pages can contain misleading text. The research prompt tells the model to treat sources as data and never follow instructions in them, but check important facts yourself.
- Anyone with your unlocked phone and this app could use your keys. Create keys just for this app so you can delete them if needed.
