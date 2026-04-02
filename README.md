# WhatsApp Blaster — Setup Guide

## Prerequisites

- [Node.js](https://nodejs.org/) v16 or higher
- npm (comes with Node.js)
- A WhatsApp account with an active phone connection

## Installation

```bash
# 1. Enter the project folder
cd whatsapp-blaster

# 2. Install dependencies
npm install
```

## Running the Service

```bash
./start.sh
```

This will install dependencies if missing, then start the server. Once running, open your browser at:

```
http://localhost:5050
```

## First-Time Setup

**Step 1 — Connect WhatsApp**

On your phone, open WhatsApp and go to **Settings → Linked Devices → Link a Device**, then scan the QR code shown in the dashboard. Your session is saved after the first scan — you won't need to do this again.

**Step 2 — Select Groups**

Choose which groups to target. All participants in the selected groups will receive your message.

**Step 3 — Write Your Message**

Use the formatting toolbar for bold, italic, strikethrough, and monospace. The preview renders your message exactly as it will appear in WhatsApp.

**Step 4 — Launch**

Send immediately with the Send Now button, or configure a recurring schedule (daily, weekly, or monthly).

## Folder Structure

```
whatsapp-blaster/
├── service.js            # Backend server (Express + WhatsApp client)
├── dashboard/
│   └── index.html        # Web dashboard
├── config.json           # Your settings (groups, message, schedule)
├── sent_log.json         # Run history and dedup log
├── start.sh              # Start script
├── package.json
└── .wwebjs_auth/         # WhatsApp session (auto-created, do not delete)
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `whatsapp-web.js` | WhatsApp Web integration via Puppeteer |
| `express` | HTTP server and dashboard |
| `qrcode` | QR code generation |
| `node-cron` | Scheduled runs |
| `cors` | Cross-origin request support |

## Troubleshooting

**QR code not appearing** — wait a few seconds and click Refresh QR. Make sure the service is running.

**Groups not loading** — your WhatsApp must be connected (Step 1 complete) before groups appear.

**Logout not working** — stop and restart the service with `./start.sh`, then try again.

**Session expired** — if WhatsApp disconnects, go back to Step 1 and scan a new QR code. Delete the `.wwebjs_auth/` folder if the QR never appears after a reconnect.

---

Developed by [@wesmailto](https://github.com/wesmailto) · wesmailto@gmail.com · All rights reserved © 2026
