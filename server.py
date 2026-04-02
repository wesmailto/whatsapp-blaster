#!/usr/bin/env python3
"""
WhatsApp Blaster — Backend API Server
"""

import json, os
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
LOG_PATH    = os.path.join(BASE_DIR, "sent_log.json")
WA_PATH     = os.path.join(BASE_DIR, "wa_state.json")   # WhatsApp connection state
DASHBOARD   = os.path.join(BASE_DIR, "dashboard")

app = Flask(__name__, static_folder=DASHBOARD)
CORS(app)

# ── Helpers ───────────────────────────────────────────────────────────────────

def rj(path):
    with open(path) as f: return json.load(f)

def wj(path, data):
    with open(path, "w") as f: json.dump(data, f, indent=2, ensure_ascii=False)

def ensure_wa_state():
    if not os.path.exists(WA_PATH):
        wj(WA_PATH, {"connected": False, "available_groups": [],
                     "sync_requested": False, "last_sync": None})

# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(DASHBOARD, "index.html")

# ── Config ────────────────────────────────────────────────────────────────────

@app.route("/api/config", methods=["GET"])
def get_config():
    return jsonify(rj(CONFIG_PATH))

@app.route("/api/config", methods=["PUT"])
def update_config():
    data = request.get_json()
    if not data: return jsonify({"error": "Bad JSON"}), 400
    cfg = rj(CONFIG_PATH)
    if "groups"   in data: cfg["groups"]   = data["groups"]
    if "message"  in data: cfg["message"]  = data["message"]
    if "dedup"    in data: cfg["dedup"].update(data["dedup"])
    if "settings" in data: cfg["settings"].update(data["settings"])
    if "schedule" in data: cfg["schedule"].update(data["schedule"])
    cfg["schedule"]["last_updated"] = datetime.utcnow().isoformat() + "Z"
    wj(CONFIG_PATH, cfg)
    return jsonify({"ok": True, "config": cfg})

# ── WhatsApp state ────────────────────────────────────────────────────────────

@app.route("/api/wa/status", methods=["GET"])
def wa_status():
    ensure_wa_state()
    state = rj(WA_PATH)
    return jsonify({
        "connected":        state.get("connected", False),
        "groups_count":     len(state.get("available_groups", [])),
        "sync_requested":   state.get("sync_requested", False),
        "last_sync":        state.get("last_sync"),
    })

@app.route("/api/wa/groups", methods=["GET"])
def wa_groups():
    ensure_wa_state()
    state = rj(WA_PATH)
    return jsonify({"groups": state.get("available_groups", [])})

@app.route("/api/wa/sync-request", methods=["POST"])
def wa_sync_request():
    """Frontend calls this to ask Claude to open WA Web and fetch groups."""
    ensure_wa_state()
    state = rj(WA_PATH)
    state["sync_requested"] = True
    wj(WA_PATH, state)
    return jsonify({"ok": True, "message": "Sync requested — Claude will fetch your groups shortly."})

@app.route("/api/wa/sync-result", methods=["POST"])
def wa_sync_result():
    """Claude in Chrome calls this after scraping groups from WhatsApp Web."""
    data = request.get_json() or {}
    ensure_wa_state()
    state = rj(WA_PATH)
    state["connected"]       = data.get("connected", True)
    state["available_groups"] = data.get("groups", [])
    state["sync_requested"]  = False
    state["last_sync"]       = datetime.utcnow().isoformat() + "Z"
    wj(WA_PATH, state)
    return jsonify({"ok": True, "groups_found": len(state["available_groups"])})

@app.route("/api/wa/set-connected", methods=["POST"])
def wa_set_connected():
    """Mark WhatsApp as connected (called after QR scan detected)."""
    ensure_wa_state()
    state = rj(WA_PATH)
    state["connected"] = request.get_json(silent=True, force=True).get("connected", True)
    wj(WA_PATH, state)
    return jsonify({"ok": True})

# ── Sent log ──────────────────────────────────────────────────────────────────

@app.route("/api/log", methods=["GET"])
def get_log():
    return jsonify(rj(LOG_PATH))

@app.route("/api/log/clear", methods=["POST"])
def clear_log():
    log = rj(LOG_PATH)
    n = len(log.get("sent", []))
    log["sent"] = []
    log["runs"].append({"type": "manual_clear", "timestamp": datetime.utcnow().isoformat() + "Z", "cleared_contacts": n})
    wj(LOG_PATH, log)
    return jsonify({"ok": True, "cleared": n})

@app.route("/api/log/run", methods=["POST"])
def record_run():
    data = request.get_json() or {}
    log  = rj(LOG_PATH)
    for c in data.get("sent_contacts", []):
        if c not in log["sent"]: log["sent"].append(c)
    log["runs"].append({
        "type": "automation_run",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "sent_count": len(data.get("sent_contacts", [])),
        "contacts": data.get("sent_contacts", []),
        "skipped_count": data.get("skipped_count", 0),
        "notes": data.get("notes", "")
    })
    wj(LOG_PATH, log)
    return jsonify({"ok": True})

# ── Run request (Send Now from dashboard) ─────────────────────────────────────

@app.route("/api/run-request", methods=["POST"])
def run_request():
    ensure_wa_state()
    state = rj(WA_PATH)
    state["run_requested"] = True
    state["run_requested_at"] = datetime.utcnow().isoformat() + "Z"
    wj(WA_PATH, state)
    return jsonify({"ok": True})

# ── Status summary ────────────────────────────────────────────────────────────

@app.route("/api/status", methods=["GET"])
def status():
    cfg = rj(CONFIG_PATH)
    log = rj(LOG_PATH)
    ensure_wa_state()
    wa  = rj(WA_PATH)
    return jsonify({
        "groups_count":   len(cfg.get("groups", [])),
        "message_set":    bool(cfg.get("message", "").strip()),
        "sent_total":     len(log.get("sent", [])),
        "runs_total":     len(log.get("runs", [])),
        "last_run":       log["runs"][-1]["timestamp"] if log.get("runs") else None,
        "wa_connected":   wa.get("connected", False),
        "wa_groups_count": len(wa.get("available_groups", [])),
    })

if __name__ == "__main__":
    ensure_wa_state()
    port = int(os.environ.get("PORT", 5050))
    print(f"\n🚀  WhatsApp Blaster running at http://localhost:{port}\n")
    app.run(host="0.0.0.0", port=port, debug=False)
