# Gibbor Voice

Custom Google Voice clone for Gibbor, powered by Twilio.

## Setup

### Prerequisites
- Node.js installed
- Twilio Account (SID, Auth Token, API Key)
- Supabase Account (URL, Key)

### Backend Setup
1. Navigate to `backend` folder:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure `.env`:
   - Rename `.env.example` to `.env` (or create it)
   - Fill in your Twilio and Supabase credentials
4. Start the server:
   ```bash
   npm start
   ```
   Server runs on `http://localhost:3001`

### Frontend Setup
1. Navigate to `frontend` folder:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   npm install @twilio/voice-sdk axios @supabase/supabase-js clsx lucide-react react-hot-toast react-hook-form zustand
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
   App runs on `http://localhost:3000`

## Usage
1. Open `http://localhost:3000`
2. Allow microphone access.
3. Use the dialpad to enter a number.
4. Click the green phone button to call.

## Troubleshooting
- **Microphone Error**: Ensure your browser allows microphone access for localhost.
- **Twilio Error**: Check the backend console for error logs. Ensure your TwiML App SID is correct in `.env`.
