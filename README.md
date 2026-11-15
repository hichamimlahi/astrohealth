# Sila

**Autonomous health monitoring and AI assistant for astronauts on deep-space missions.**  
Project of team **TAMUNT** for the NASA Space Apps Challenge 2026 (Ben Guerir), challenge: *Create Health Monitoring Software for Astronauts on Space Missions*.

> Sila is a prototype. It is **not a certified medical device**. All data in this repository is simulated, and the alert thresholds are indicative and must be validated by aerospace medical professionals.

---

## What it does

Astronauts on long-duration exploration missions (Moon, Mars) are millions of kilometers from Earth, facing up to **20 minutes of one-way communication latency** and potential communication blackouts. Sila provides:

- **Astronauts** an autonomous personal dashboard: real-time vital signs with clear color-coded states, dynamic dose gauges, charts with normal physiological ranges, active alert banners, operational countermeasures, and an explanatory AI health assistant.
- **Flight Surgeons (Ground Doctors)** a crew overview (status of each astronaut), active alerts table, multi-astronaut trend charts, historical telemetry browser (filter by astronaut, parameter, and time window), and an AI-generated crew telemetry summary.
- **Auditable Deterministic Alert Engine:** when a measurement crosses a medical threshold, the deterministic rules engine immediately creates an alert (attention or critical). Alerts come from a **pure deterministic engine, not from an AI**: they guarantee **0 hallucination** and operate completely offline without requiring ground connectivity.
- **Explanatory AI Assistant (BNF11 Privacy Compliant):** explains measurements and active alerts in plain, calm language. It never delivers a medical diagnosis, never prescribes treatment, and receives **zero nominative data** (no name, email, or personal identifiers, strictly complying with the BNF11 space privacy rule). If the AI service is unreachable, a robust backup mode provides predefined operational responses.
- **Emergency Voice Mode & Fallback:** for an astronaut under extreme stress or physical impairment who cannot navigate touchscreens. Triggered verbally by key phrases (*"emergency"*, *"I feel dizzy"*, *"mayday"*, *"urgence"*, *"vertige"*) or via the red EMERGENCY button. Features an automatic countdown, speech-to-text transcription, and immediate Socket.IO dispatch to ground control. Keyboard shortcuts (`Alt + U`, `Shift + E`) and a 1-click simulation button guarantee a seamless presentation during live jury demonstrations.
- **Real-Time Synchronized Telemetry:** bidirectional real-time push via Socket.IO (`nouvelle_mesure`, `nouvelle_alerte`, `nouvelle_urgence`) with a 5-second polling fallback.

---

## Space Medical Security & Deep-Space Architecture

### 1. Earth-Mars Communication Latency Management
Sila includes a live mission environment selector in the header:
- **ISS (Low Earth Orbit):** 0.2 s latency | Real-Time Earth Synchronization.
- **Artemis Lunar Base:** 2.6 s latency | Lunar Relay Active.
- **Mars Transit / Base:** 20 min (One-Way) latency | **Autonomous Onboard Mode Active**.

When Mars Transit is active, Sila automatically engages its **Autonomous Onboard Mode**, warning the crew that telemetry-driven medical countermeasures and local AI assistance operate independently without waiting for mission control in Houston.

### 2. NASA Human Research Program (HRP) 5 Hazards & CSA Radiation
Each monitored parameter is explicitly mapped to the **5 Hazards of Human Spaceflight**:
- ☢️ **Space Radiation (CSA):** Dedicated radiation card measuring daily dose (`mSv/jour` or `mSv`), equipped with a dynamic visual dose gauge (Normal < 0.5 mSv/j in green, Attention 0.5–1.5 mSv/j in orange, Critical > 1.5 mSv/j in red) based on Canadian Space Agency (CSA) dosimeter research.
- 🪐 **Altered Gravity Fields:** Cardiovascular deconditioning tracking (Heart Rate, Blood Pressure).
- 舱 **Hostile / Closed Environment:** Cabin environmental life support (Pulse Oximetry SpO2 / Hypoxia risk, Body Temperature).
- 🧠 **Isolation & Confinement:** Circadian rhythm and psychological monitoring (Sleep duration, Mood score).
- 🛰️ **Distance from Earth:** Autonomous onboard deterministic triage and real-time voice emergency alerts.

### 3. Hybrid Medical AI Architecture
- **Deterministic Rules Authority:** Medical decisions, alert thresholds, and score evaluations are strictly governed by deterministic SQL rules and verified algorithms.
- **Explanatory Role Only:** The AI language model is strictly confined to explaining verified numbers and suggesting safe physical countermeasures (hydration, rest, entering shielded radiation storm shelters).
- **BNF11 Telemetry Anonymization:** In full alignment with spaceflight bioethics, telemetry fed to language models is completely stripped of names, email addresses, and personal metadata. Identifiers are masked as *"Astronaut 1"*, *"Astronaut 2"*.
- **Edge AI Roadmap:** The system architecture is built to support lightweight, onboard offline SLMs (Small Language Models such as Google Gemma 2B or Microsoft Phi-3 Mini) running directly on spacecraft compute nodes without internet access.

---

## Tech Stack

| Part | Technology |
|---|---|
| Front-end | Angular (SSR compatible), Chart.js, Socket.IO client, SCSS |
| Back-end | Node.js, Express (REST API), Socket.IO, MySQL2 |
| Database | MySQL / MariaDB (12 relational tables) |
| AI Assistant | OpenAI-compatible API (extensible to local Gemma 2B / Phi-3 SLMs) |
| Voice Processing | Web Speech API (Chrome / Edge) + Keyboard Fallback (`Alt+U`, `Shift+E`) |
| Simulator | 1-Click Interactive Web Panel + Node.js CLI script |

---

## Repository Structure

```
Sila/
├── backend/     Node.js + Express API (port 3000)
│   ├── config/  Database connection (MySQL)
│   ├── routes/  REST routes (assistant, mesures, alertes, simulateur, urgences)
│   └── services/Deterministic alert & recommendation engine
├── frontend/    Angular SSR Application (port 4200)
│   └── src/app/pages/
│       ├── choix-profil/         Landing & role switcher
│       ├── dashboard-astronaute/ Astronaut telemetry, radiation gauge, AI chat & demo panel
│       ├── vue-medecin/          Flight surgeon crew overview, emergency banners & summaries
│       └── historique/           Historical telemetry data visualizer
├── simulator/   Stand-alone CLI scenario runner
├── database/    SQL schema and demo data scripts
└── docs/        Medical architecture, assistant examples, and specifications
```

---

## Run it locally

### 1. Requirements

- [Node.js](https://nodejs.org) (LTS version)
- [XAMPP](https://www.apachefriends.org) (Apache and MySQL/MariaDB)
- Angular CLI: `npm install -g @angular/cli`
- Git

### 2. Database Setup

1. Open XAMPP Control Panel and start **Apache** and **MySQL**.
2. Open [http://localhost/phpmyadmin](http://localhost/phpmyadmin).
3. Without selecting any database, click **Import** and select `database/astrohealth_base_complete.sql`. It creates the database, 12 tables, 10 space parameters, and default medical thresholds.
4. Select the `astrohealth` database, click **Import**, and select `database/donnees_demo.sql`.

### 3. Back-end

```powershell
cd backend
copy .env.example .env
npm install
npm start
```
The server starts on `http://localhost:3000` with confirmation `connected to astrohealth database!`.

### 4. Front-end

In a second terminal:
```powershell
cd frontend
npm install
npx ng serve
```
Open your browser at **http://localhost:4200**.

---

## Jury Live Demo (1-Click Mode)

During a pitch or presentation, no terminal is needed:
1. Open the **Astronaut Dashboard** on `http://localhost:4200`.
2. Click the floating **🧪 Mode Démo** button (bottom right):
   - 🟢 **Scénario Nominal:** Instantly clears alerts and sets all vitals to optimal green ranges.
   - 🟠 **Baisse d'oxygène SpO2:** Triggers progressive hypoxia (SpO2 drops to 86%, heart rate spikes to 118 bpm) with live attention/critical alerts.
   - 🔴 **Tempête Solaire:** Triggers a dangerous space radiation spike (2.8 mSv/j) driving the CSA dosimeter gauge into critical red with shelter countermeasures.
   - 🎙️ **Simuler commande vocale:** Simulates *"Emergency, I feel dizzy"* with keyboard shortcut `Alt + U` / `Shift + E`.
3. Open **Ground Doctor** in another tab to observe real-time telemetry and emergency banner dispatch via Socket.IO.

---

## Team TAMUNT

- **ABBOU Aimrane** (Team Owner)
- **Sara Sedki**
- **Hajar En-neyah**
- **Hicham Imlahi**
- **Hamza Koujili**
