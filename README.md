# WhatsApp Blaster

Automatically send WhatsApp DMs to all members of your groups — on demand or on a schedule. Built with Node.js and whatsapp-web.js.

---

## Prerequisites

Before you start, make sure you have the following installed on your machine:

- **Node.js** v16 or higher → [nodejs.org](https://nodejs.org/)
- **npm** (comes bundled with Node.js)
- **A WhatsApp account** with an active phone connection to the internet

To verify your Node.js installation, run:

```bash
node -v
npm -v
```

---

## Installation

**1. Download the project**

Go to [github.com/wesmailto/whatsapp-blaster](https://github.com/wesmailto/whatsapp-blaster), click the green **Code** button, then **Download ZIP**.

Unzip the folder anywhere on your computer, then open a terminal inside it.

> If you use git, you can also run: `git clone https://github.com/wesmailto/whatsapp-blaster.git`

**2. Install dependencies**

```bash
npm install
```

> This installs all required packages including the WhatsApp client, Express server, and scheduler. It may take a minute — whatsapp-web.js downloads a Chromium browser in the background.

**3. Start the service**

```bash
./start.sh
```

> On Windows, run `node service.js` directly instead.

**4. Open the dashboard**

Once the service is running, open your browser and go to:

```
http://localhost:5050
```

---

## First-Time Setup

Follow the 4-step wizard in the dashboard:

**Step 1 — Connect WhatsApp**

A QR code will appear on screen. On your phone:
1. Open **WhatsApp**
2. Go to **Settings → Linked Devices → Link a Device**
3. Scan the QR code

Your session is saved automatically after the first scan — you won't need to do this again.

**Step 2 — Select Groups**

Choose which WhatsApp groups to target. Every participant in the selected groups will receive your message as a DM.

**Step 3 — Write your message**

Use the formatting toolbar to compose your message. The preview shows exactly how it will appear in WhatsApp.

**Step 4 — Launch**

Hit **Send Now** to send immediately, or configure a recurring schedule (daily, weekly, or monthly).

---

## Stopping the Service

Press `Ctrl+C` in the terminal to stop the server.

---

## Folder Structure

```
whatsapp-blaster/
├── service.js          # Backend server (Express + WhatsApp client)
├── dashboard/
│   └── index.html      # Web dashboard (single file)
├── config.json         # Your settings (auto-updated by the dashboard)
├── sent_log.json       # Run history and dedup log
├── start.sh            # Start script (Mac/Linux)
├── package.json
└── .wwebjs_auth/       # WhatsApp session data (auto-created, do not delete)
```

---

## Troubleshooting

**QR code not showing up**
Wait a few seconds and click **Refresh QR**. Make sure the service is running in your terminal.

**Groups not loading**
Your WhatsApp must be connected (Step 1 complete) before groups appear. Check that your phone is online.

**`./start.sh` permission denied**
Run this once to make the script executable:
```bash
chmod +x start.sh
```

**Session expired after a few days**
Go back to Step 1 and scan a new QR code. If the QR never appears, delete the `.wwebjs_auth/` folder and restart the service:
```bash
rm -rf .wwebjs_auth/
./start.sh
```

**Port 5050 already in use**
Another process is using that port. Either stop it, or change the port in `service.js`:
```js
const PORT = process.env.PORT || 5051  // change to any free port
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `whatsapp-web.js` | WhatsApp Web integration via headless Chromium |
| `express` | HTTP server and API |
| `qrcode` | QR code generation for WhatsApp linking |
| `node-cron` | Scheduled automatic runs |
| `cors` | Cross-origin request support |

---

Developed by [@wesmailto](https://github.com/wesmailto) · [wesmailto@gmail.com](mailto:wesmailto@gmail.com) · All rights reserved © 2026
