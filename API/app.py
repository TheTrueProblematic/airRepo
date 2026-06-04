#!/usr/bin/env python3
"""
HTTP API for the airRepo Aircraft Registry Aggregator.

Wraps airRepo.query_flow in a small Flask app suitable for Cloud Run.
Endpoints:
    GET  /                       Service info
    GET  /healthz                Liveness probe
    GET  /v1/aircraft/<tail>     Tail-number lookup
"""

import logging
import os

from flask import Flask, jsonify
from flask_cors import CORS

import airRepo

app = Flask(__name__)

# CORS origins for the frontend(s). Override via AIRREPO_CORS_ORIGINS as a
# comma-separated list when running behind a different domain.
_default_origins = "https://airrepo.net,https://www.airrepo.net,http://localhost:5173,https://airrepo-8e96a.web.app,https://airrepo-8e96a.firebaseapp.com"
_origins = [o.strip() for o in os.environ.get("AIRREPO_CORS_ORIGINS", _default_origins).split(",") if o.strip()]
CORS(app, resources={r"/v1/*": {"origins": _origins}})

# Initialise the configured cache backend at boot so the first request does
# not pay the schema-creation / client-construction cost.
airRepo.init_db()


@app.route("/", methods=["GET"])
def root():
    return jsonify({
        "service": "airRepo",
        "version": "1",
        "endpoints": ["/healthz", "/v1/aircraft/<tail>"],
    })


@app.route("/healthz", methods=["GET"])
def healthz():
    return jsonify({"status": "ok"})


@app.route("/v1/aircraft/<tail>", methods=["GET"])
def lookup_aircraft(tail: str):
    try:
        result = airRepo.query_flow(user_input=tail)
    except Exception:
        logging.exception("Unhandled lookup failure for tail=%s", tail)
        return jsonify({"error": "internal_error"}), 500

    if not result:
        return jsonify({"error": "not_found", "tail": tail}), 404

    if "error" in result:
        if result["error"] == "Unsupported region":
            return jsonify({
                "error": "unsupported_region",
                "region": result.get("region"),
            }), 400
        return jsonify({"error": "not_found", "tail": tail}), 404

    return jsonify({
        "tail": result.get("original_tail"),
        "make_model": result.get("make_model"),
        "manufactured": result.get("date_manufactured"),
        "owner": result.get("owner"),
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
