# Student Wellbeing Companion — Project Brief

**Owner:** م. يوسف علي عطوة — Head of Electronics & Programming, Fab Lab Al-Ahsa
**Purpose:** Hand-rest sensor device + platform to support a school student counselor (مرشدة طالبات) during counseling/therapeutic sessions. The student rests their hand on a small hand-shaped sensor pad which captures biometric signals while they talk; the platform pairs speech and biometrics, sends them to an AI API for real-time emotional/psychological state analysis, and returns guidance to the counselor (not the student) on how to approach the session.

---

## 1. Concept summary

- A student rests their hand on a small hand-shaped sensor pad during a counseling session.
- The device streams biometric data + audio to a hub (phone/laptop/Raspberry Pi or directly to cloud via WiFi).
- An AI API (speech-to-text + analysis) processes the transcript + biometric readings together.
- The AI returns:
  1. A plain-language read of the student's likely emotional/psychological state.
  2. Suggested tone/approach for the counselor to use — **shown only on the counselor's dashboard, never on the student's device.**
- Sessions are logged on Fab Lab's platform for follow-up tracking.

**Important framing constraint:** This is decision-support for the counselor, not a diagnostic or clinical tool. Keep this framing explicit in all UI copy, prompts to the AI API, and documentation — it matters for Foundation/Ministry of Education approval given this involves minors and biometric data.

---

## 2. Bill of materials (confirmed, already purchased)

| # | Component | Function | Interface |
|---|---|---|---|
| 1 | MAX30102 | Heart rate + SpO2 (PPG) | I2C — addr `0x57` |
| 2 | Seeed Grove GSR sensor | Skin conductance / stress-arousal | Analog (ADC) |
| 3 | GY-906 MLX90614 | Contactless skin temperature | I2C — addr `0x5A` |
| 4 | INMP441 | I2S digital mic (voice capture) | I2S |
| 5 | MPU-6050 | Motion / fidgeting (accel + gyro) | I2C — addr `0x68` |
| 6 | ESP32 DevKitC-32 (WROOM, 38-pin) | Main controller, WiFi/BT | — |
| 7 | LiPo battery 3.7V 1000mAh | Power source | — |
| 8 | JSD19 1S charger + boost module | Battery charge/power management | — |
| 9 | Jumper wires M-M, 40pcs | Wiring | — |

Full costed BOM: `Student_Wellbeing_Electronics_Cost_Analysis.xlsx` (already generated).

**No I2C address conflicts** — MAX30102 (0x57), MLX90614 (0x5A), and MPU-6050 (0x68) can share the same I2C bus (SDA/SCL). GSR reads via a dedicated ADC-capable GPIO. INMP441 uses separate I2S pins (WS/SCK/SD).

### Still needed (mechanical, not yet costed)
- On/off switch
- Hand-shaped sensor pad housing (contoured to the student's palm — MAX30102 under one fingertip, GSR pads under two other fingertips, MLX90614 aimed at the back of the resting hand)
- Small enclosure for ESP32 + battery (integrated into the pad base)
- Optional status LED (recording/connected indicator)

### Suggested sensor placement (hand-rest form factor)
- MAX30102 → under the index-finger tip position
- GSR pads → under the middle and ring finger positions
- MLX90614 → aimed at the back of the hand (non-contact)
- No wristband strap needed — the student simply rests their palm on the pad for the duration of the session

---

## 3. System architecture

```
[Hand-rest sensor: ESP32 + sensors in a hand-shaped pad]
        │  WiFi / BLE
        ▼
[Hub: phone / laptop / Fab Lab server]
        │
        ├── Speech-to-text (Whisper API or similar)
        ├── Biometric feature bundle (HR/HRV, GSR, temp, motion)
        │
        ▼
[AI API call: transcript + biometric bundle → analysis]
        │
        ▼
[Counselor dashboard]
   - Plain-language emotional/psychological state summary
   - Suggested tone/approach for this session
   - Session logged for follow-up tracking
```

**Student-facing device:** status only (power/connected/recording), no analysis surfaced.
**Counselor-facing dashboard:** all AI output, session history, per-student trends over time.

---

## 4. ESP32 pin map (proposed — confirm against your specific DevKitC-32 pinout before wiring)

| Signal | Sensor | ESP32 GPIO (suggested) |
|---|---|---|
| SDA | MAX30102 / MLX90614 / MPU-6050 | GPIO 21 |
| SCL | MAX30102 / MLX90614 / MPU-6050 | GPIO 22 |
| GSR analog out | Grove GSR | GPIO 34 (ADC1) |
| I2S WS (LRCLK) | INMP441 | GPIO 25 |
| I2S SCK (BCLK) | INMP441 | GPIO 26 |
| I2S SD (data) | INMP441 | GPIO 27 |
| Status LED | — | GPIO 2 (onboard) or external |
| Battery voltage sense (optional) | — | GPIO 35 (ADC1) |

---

## 5. Firmware scope (ESP32 / Arduino or PlatformIO)

1. **Sensor drivers**
   - MAX30102: use SparkFun or MAX3010x library — read HR + SpO2, compute basic HRV (inter-beat interval variability) on-device or pass raw IBI values upstream.
   - MLX90614: Adafruit MLX90614 library — periodic skin temp read (e.g. every 1–2s).
   - MPU-6050: read accel/gyro, compute a simple movement/restlessness score (e.g. rolling variance of acceleration magnitude).
   - GSR: analogRead on ADC pin, apply smoothing/moving average, track baseline vs. spike detection.
   - INMP441: I2S read loop, stream PCM audio buffer.

2. **Data packaging**
   - Combine sensor readings into a JSON payload every N seconds (e.g. every 5s) with timestamp.
   - Buffer/stream audio separately (chunked) — don't try to embed raw audio in the same JSON as sensor telemetry.

3. **Connectivity**
   - WiFi connect (store credentials in `secrets.h`, not committed to git).
   - Send biometric JSON to hub/backend via HTTP POST or WebSocket.
   - Send audio chunks via WebSocket or a separate streaming endpoint.

4. **Power management**
   - Deep sleep or light sleep between sessions to preserve battery.
   - Battery voltage monitoring, low-battery warning on status LED.

---

## 6. Backend / AI integration scope

1. **Speech-to-text**: pipe audio chunks to Whisper API (or equivalent) → running transcript.
2. **Feature bundling**: every analysis cycle (e.g. every 15–30s of conversation), bundle:
   - Transcript segment
   - HR/HRV trend over that window
   - GSR trend (baseline vs. spikes)
   - Skin temp trend
   - Motion/restlessness score
3. **AI API call**: send bundle to Claude/GPT with a system prompt that:
   - Frames the AI as producing **decision support for the counselor**, not a diagnosis.
   - Requests: (a) a plain-language state summary, (b) 1–3 suggested approaches/phrasing for the counselor.
   - Explicitly instructs the model not to output anything intended to be shown to the student directly.
4. **Dashboard**: real-time view for the counselor showing current session's rolling analysis + history per student.
5. **Data storage**: log each session's transcript, biometric summary, and AI output tied to student ID, with retention policy (see compliance note below).

---

## 7. Compliance / ethics checklist (do not skip)

- [ ] Explicit parental + student consent for biometric data + audio collection.
- [ ] Clear data retention period and deletion policy.
- [ ] Data access restricted to counselor(s) only — not shared with teachers/admin by default.
- [ ] AI output framed as decision-support, never a diagnosis, in both prompt design and UI copy.
- [ ] Encryption at rest and in transit for all session data (transcripts + biometrics are sensitive minor data).
- [ ] Review path with Fab Lab Al-Ahsa / Abdul Muneim Al-Rashid Humanitarian Foundation before deployment with real students.

---

## 8. Immediate next steps for Claude Code

1. Set up firmware project (PlatformIO recommended over Arduino IDE for library management).
2. Implement and bench-test each sensor driver individually before integrating.
3. Build the JSON payload structure and a mock HTTP endpoint to test data flow end-to-end.
4. Prototype the AI system prompt (bundle → state summary + counselor guidance) with sample data before wiring up live audio.
5. Build minimal counselor dashboard (even a simple web page) to visualize incoming session data.

---

## 9. Reference files

- `Student_Wellbeing_Electronics_Cost_Analysis.xlsx` — full costed BOM with VAT breakdown.
