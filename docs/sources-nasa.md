# NASA data and resources used by SILA (team TAMUNT)

> **Important and honest note.** SILA is a prototype. Its measurements are **simulated**: no real astronaut data is used. The NASA and space-agency resources below are the scientific basis for **what SILA monitors and how it is designed**. Rows marked **[TO REVIEW]** have not been read by the team yet: do not claim them in the submission until they are.

All resources below are listed on the challenge page of the NASA Space Apps Challenge 2026, under "NASA Data & Resources" and "Space Agency Partner Resources".

---

## 1. Resources

| # | Resource | Link | What it says (our summary) | How SILA uses it |
|---|---|---|---|---|
| 1 | **5 Hazards of Human Spaceflight** (NASA Human Research Program) | https://www.nasa.gov/hrp/hazards/ | NASA groups the hazards astronauts face into five categories: space radiation, isolation and confinement, distance from Earth, gravity fields, and hostile or closed environments. The hazards interact and can make each other worse. | Framework used to choose the parameters SILA monitors and the features it offers (see section 2). |
| 2 | **Monitoring Radiation for Astronaut Health** (Canadian Space Agency, 2026-02-26) | https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp | Radiation is a key challenge beyond Earth's atmosphere. The CSA funds a compact autonomous instrument that measures neutron radiation continuously; neutrons account for about 30% of the radiation on the ISS. | Motivation for the radiation parameter in our data model. A real dosimeter feed could be plugged in later, in place of simulated values. |
| 3 | **Risks of Human Spaceflight** (NASA Human Research Program) | https://www.nasa.gov/hrp/risks/ | [TO REVIEW] | [TO REVIEW: link 2 or 3 specific risks to monitored parameters] |
| 4 | **Ongoing HRP Research in Space** (NASA Human Research Program) | https://www.nasa.gov/hrp/ongoing-hrp-research/ | [TO REVIEW] | [TO REVIEW] |
| 5 | **Why Do We Conduct Science Experiments in Space?** (CSA) | https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp | [TO REVIEW] | [TO REVIEW] |

---

## 2. How the five NASA hazards map to SILA

| NASA hazard | What SILA monitors or does | Status today |
|---|---|---|
| **Space radiation** | Parameter `RADIATION` (daily dose) with attention and critical thresholds. | Data model and thresholds done. Not yet shown on a dashboard card or sent by the simulator. |
| **Isolation and confinement** | Sleep duration (`SOMMEIL`) on the astronaut dashboard; mood score (`HUMEUR`) and a feelings table in the data model. | Sleep done. Mood: data model only. |
| **Distance from Earth** | "Ground link" indicator on both screens; AI assistant with a backup mode that keeps answering when the AI service or the link is unavailable; unique identifiers and a synchronization flag on every record, designed for later offline sync. | Indicator and backup mode done. Offline synchronization **not implemented**. |
| **Gravity fields** | Heart rate on the dashboards; blood pressure and exercise duration (`EXERCICE`) in the data model. | Heart rate done. Blood pressure and exercise: data model only. |
| **Hostile or closed environments** | Body temperature and respiratory rate. | Temperature done. Respiratory rate: data model only. Habitat sensors (air, noise, pressure) are out of scope. |

---




