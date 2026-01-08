# Project Handoff: Gibbor Voice (Stable) & AI Lab

## 1. Gibbor Voice (Stable Release) 🛡️

**Status:** PRODUCTION / MAINTENANCE
**Directory:** `.../gibbor-voice`

### Key Features Established

- **Incoming Calls:** Robust logic with "Sticky Agent" routing + Emergency Answer Button.
- **Reporting:** Admin-only advanced metrics.
- **UI Logic:** Separated views for Admin (Full Access) vs User/Agent (Simplified: Calls/Messages/History).
- **Stability:** "Heartbeat" monitor, Visual Status Bar, Auto-Reconnect, and Manual Reload Button.
- **UX:** Audio Feedback (TTS) for connection restoration and Reconnecting Spinner.
- **Mobile:** PWA Support (Installable Web App) with Manifest and Icons.

### Known State

- **Debug Bar:** Hidden (Code preserved in `MainDashboard.tsx`).
- **Billing:** Optimized for standard Twilio usage (Charges for ringing).
- **Performance:** Complex tabs hidden for agents to reduce load.

---

## 2. Gibbor AI Lab (Next Steps) 🧪

**Status:** TO START
**Directory:** `.../gibbor-ai` (Created)

### Objective

Create a separate, experimental application to test advanced AI features without risking the stability of the main call center operations.

### Immediate Plan (Phase 1: Setup)

1. **Start New Chat**.
2. Initialize new Next.js project in `gibbor-ai`.
3. Reuse environment variables (Twilio/Supabase).

### Phase 2: UI Redesign (Google Voice Clone) 🎨

**Goal:** Transform the visual experience to match Google Voice (Material Design 3).
**Reference:** I have already created the **Layout Skeleton** in `MainDashboard.tsx` (Nav Rail + Secondary Column), but the data logic needs to be moved into it.

**Tasks for New Agent:**

1. **Activate the Skeleton:** Locate the "NAVIGATION RAIL" and "SECONDARY COLUMN" comments in `MainDashboard.tsx`.
2. **Move List Logic:** Move the `calls.map` and `messages.map` logic INTO the "SECONDARY COLUMN" div.
3. **Modernize Components:**
    - **Avatars:** Use colored circles with Initials (remove images if any).
    - **Search:** Ensure the "Pill" shape search bar is functional.
    - **Fab:** Add a Floating Action Button (+) for new calls.
4. **Animations:** Use `framer-motion` for smooth layout transitions.
