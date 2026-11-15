# SahtAstro

**Health monitoring and AI assistant for astronauts on space missions.**
Project of team **SpaceCare Alliance** for the NASA Space Apps Challenge 2026 (Ben Guerir), challenge: *Create Health Monitoring Software for Astronauts on Space Missions*.

> SahtAstro is a prototype. It is **not a medical device**. All data in this repository is simulated, and the alert thresholds are indicative and must be validated by medical professionals.

---

## What it does

Astronauts on long missions are far from hospitals, and the link with Earth can be delayed or cut. SahtAstro gives:

- **Astronauts** a personal dashboard: current vital signs with a clear status, charts with the normal range, an active alert banner, a simple recommendation, and a chat with an AI assistant.
- **The ground doctor** a crew overview (status of each astronaut), a table of active alerts, a trends chart with one line per astronaut, a History page (filter by astronaut, parameter and period), and an AI-generated crew summary.
- **Automatic alerts:** when a measurement crosses a threshold, the server creates an alert (attention or critical). Alerts come from a **rules engine, not from the AI**: they keep working if the AI service or the link is unavailable.
- **An AI assistant** that explains measurements and alerts in plain language. It never gives a diagnosis, it receives **no personal data** (no name, e-mail or age), and a warning is always shown. If the AI service is unavailable, a backup mode answers with predefined messages so the application never breaks.

- **An emergency voice mode** for an astronaut under high stress who cannot use the normal screens. The astronaut says a trigger phrase ("emergency", "mayday" or "code red") or taps the red EMERGENCY button. The screen switches to a simple, high-contrast view, the astronaut describes what is happening out loud, the speech is turned into text, and the report is sent straight to the ground doctor, who sees a red banner in real time. If the astronaut stays silent, a report is still sent after 10 seconds, and a "Cancel (false alarm)" button is always available. A text box is the fallback when the microphone is unavailable. The app never gives medical advice in this mode: it only alerts the doctor.

The screens update in real time: the server pushes `nouvelle_mesure` and `nouvelle_alerte` events with Socket.IO, and the screens also refresh every 5 seconds as a safety net.

## Tech stack

| Part | Technology |
|---|---|
| Front-end | Angular, Chart.js, Socket.IO client |
| Back-end | Node.js, Express (REST API), Socket.IO |
| Database | MySQL / MariaDB (12 tables) |
| AI assistant | Language model called from the server (any OpenAI-compatible API) |
| Simulator | Node.js script (no dependency) |
| Voice input | Web Speech API of the browser (Chrome or Edge) |
| Design | Figma |

## Repository structure

```
SahtAstro/
├── backend/     Node.js + Express API (port 3000)
├── frontend/    Angular application (port 4200)
├── simulator/   Measurement simulator for demos
├── database/    SQL scripts and example JSON
└── docs/        Specifications and design documents
```

## Run it locally

### 1. Requirements

- [Node.js](https://nodejs.org) (LTS version)
- [XAMPP](https://www.apachefriends.org) (Apache and MySQL/MariaDB)
- Angular CLI: `npm install -g @angular/cli`
- Git

### 2. Database

1. Open XAMPP and start **Apache** and **MySQL**.
2. Open http://localhost/phpmyadmin.
3. Without selecting any database, click **Import** and import `database/SahtAstro_base_complete.sql`. It creates the `SahtAstro` database, the 12 tables, the 10 parameters and the 19 default thresholds.
4. Click the `SahtAstro` database, then **Import** and import `database/donnees_demo.sql`. It adds the demo mission, 4 astronauts, measurements, alerts and messages. You can run it again at any time to reset the demo data.

### 3. Back-end

```
cd backend
copy .env.example .env
npm install
npm start
```

The server starts on http://localhost:3000. You should see `server running on port 3000` and `connected to SahtAstro database!`.

The default `.env` values work with XAMPP:

```
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=SahtAstro
```

**AI assistant (optional):** to use a real language model, set `AI_API_KEY` (and, if needed, `AI_MODEL` and `AI_API_URL`) in your `.env` file. Never commit this file. Without a key, the assistant answers in **backup mode** (predefined messages).

### 4. Front-end

In a second terminal:

```
cd frontend
npm install
ng serve
```

Open http://localhost:4200.

### 5. Try it

1. Choose **Astronaut** to see the personal dashboard. The demo data contains an active SpO2 alert for the astronaut shown.
2. Open the chat (💬) and ask: *What is happening with my oxygen level?*
3. Go back and choose **Ground Doctor** to see the crew overview, the active alerts, and the History page.
4. Start the simulator in a third terminal, from the project root, to see live updates and a new alert appear:

```
node simulator/simulator.js --scenario=oxygene
```

The oxygen level of the first astronaut slowly drops from 98% to 85%: an attention alert, then a critical alert appear on the doctor view. Other options (`--sommeil`, `--cible`, `--interval`, `--dry`) are described in `simulator/README.md`.
5. Try the **emergency voice mode** in Chrome or Edge: on the astronaut dashboard, click **Voice trigger** (allow the microphone), then say *"emergency, I feel dizzy"*. The emergency screen opens with your words; after 5 seconds of silence the report is sent. Open **Ground Doctor** in another tab to see the red banner. The red **EMERGENCY** button does the same without voice.

## API overview

| Method | Route | Description |
|---|---|---|
| GET | `/api/parametres` | List of monitored parameters with units and normal ranges |
| GET | `/api/astronautes` | List of astronauts |
| GET | `/api/astronautes/:id/mesures/latest` | Latest value of each parameter |
| GET | `/api/astronautes/:id/mesures?parametre=FC&debut=...&fin=...` | Measurements of one parameter over a period |
| POST | `/api/mesures` | Record a measurement (creates an alert if a threshold is crossed) |
| GET | `/api/alertes?statut=active` | Alerts, optionally filtered by status |
| POST | `/api/assistant/chat` | Ask the AI assistant a question |
| POST | `/api/assistant/resume-equipage` | Generate a crew health summary for the ground doctor |
| GET | `/api/assistant/historique?id_astronaute=1` | Conversation history of an astronaut |
| POST | `/api/simulateur/scenario` | Run a built-in demo scenario (`baisse_oxygene` or `normal`) |
| POST | `/api/urgences` | Send an emergency voice report from an astronaut (`id_astronaute`, `texte`) |
| GET | `/api/urgences?minutes=60` | Emergency reports of the last minutes, newest first |

Real-time events (Socket.IO): `nouvelle_mesure`, `nouvelle_alerte`, `nouvelle_urgence`.

Emergency reports are stored in the existing `message_ia` table with `role_message = 'urgence'` and `mode = 'urgence'`, so no database change is needed.

The full specification is in the `docs` folder.

## NASA resources and data

SahtAstro is a prototype built on **NASA Human Research Program (HRP) resources**. No NASA dataset is imported: these resources guided what we monitor and how we designed the product.

| NASA resource | What we took from it | Where it appears in SahtAstro |
|---|---|---|
| [5 Hazards of Human Spaceflight](https://www.nasa.gov/hrp/hazards/) | Five hazards (space radiation, isolation and confinement, distance from Earth, gravity fields, hostile or closed environments), and the point that hazards can make each other worse | Organization of the monitored parameters and features; an astronaut's status takes the most severe color among all parameters; alerts that work without AI or a link to Earth address "distance from Earth" |
| [Risks of Human Spaceflight](https://www.nasa.gov/hrp/risks/) | Specific risks linked to the hazards | Risk of Hypoxia: SpO2. Risk of Inadequate Sleep and Irregular Schedules: sleep duration. Risk of Cardiovascular Adaptations: heart rate and blood pressure. Risk of Radiation-Induced Cancers: radiation parameter (data model). Risk of Inadequate Systems Operations Support: AI assistant with a backup mode. Risk of Behavioral Changes and Psychiatric Disorders (stress of space missions): emergency voice mode for an astronaut under high stress |
| [Ongoing HRP Research in Space](https://www.nasa.gov/hrp/ongoing-hrp-research/) | Artemis II studies on well-being, activity and sleep (ARCHeR) and on a consistent set of health measures (Standard Measures) | Model for wearable-based sleep and activity monitoring and for a consistent set of parameters per astronaut |

Space agency partner resource used as motivation: Canadian Space Agency, [Monitoring Radiation for Astronaut Health](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp), for tracking radiation exposure.

Details and the status of each hazard in the application are in `docs/sources-nasa.md`.

**What is not from NASA:** the alert thresholds (for example SpO2 below 92% for "attention", heart rate above 120 bpm) are **indicative values chosen by the team**. They are not taken from NASA documents and must be validated by medical professionals.

## Use of AI

- **In the product:** the assistant uses a language model to explain measurements and alerts and to write the crew summary. It receives only anonymous measurements (the crew summary uses "Astronaut 1", "Astronaut 2", and so on), never gives a diagnosis, and shows a permanent warning. Alerts are decided by a rules engine, not by the AI.
- **In development:** AI tools were used by the team to help write and review parts of the code, the documentation and the design documents (Claude by Anthropic). The team reviewed and tested the result.

## Limitations and next steps

- Replace simulated data with real wearable sensors and radiation dosimeters (a radiation card on the astronaut dashboard is planned).
- Full offline mode with automatic synchronization when the link with Earth returns. Records already carry a unique identifier and a synchronization flag for this; the synchronization itself is not implemented.
- An onboard AI model that works without an Internet connection (today the assistant calls an online API and falls back to predefined messages).
- Onboard speech recognition for the emergency mode. Today it uses the browser's speech service (Chrome sends the audio to an online service, so it needs Internet and works only in Chrome or Edge); the red button and the text box work without it. The trigger phrases are a first version and need tuning against false alarms.
- Personal baselines per astronaut and weekly summaries for the medical team.
- Validation of thresholds with medical professionals.

## Team SpaceCare Alliance

ABBOU Aimrane (Team Owner), Sara Sedki,hajar en-neyah , hicham imlahi, Hamza Koujili
