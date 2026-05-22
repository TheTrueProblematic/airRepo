#!/usr/bin/env python3
"""
One-shot ingestion script: download bulk registries and write into the
configured cache backend (Firestore for production, SQLite locally).

Run this once after deploying so the live API never has to perform a
multi-megabyte download inside a user request.

Usage:
    # Seed every supported region into Firestore:
    set AIRREPO_BACKEND=firestore
    set GOOGLE_APPLICATION_CREDENTIALS=path\to\sa.json   (Windows)
    # export AIRREPO_BACKEND=firestore                    (mac/linux)
    # export GOOGLE_APPLICATION_CREDENTIALS=path/to/sa.json
    python seed.py

    # Seed just a couple of regions:
    python seed.py US Canada

Firestore write cost (one-time): roughly $0.18 per 100k documents. The FAA
US registry is the only sizeable one (~290k aircraft, ~$0.52).
"""

import os
import sys

import airRepo

DEFAULT_REGIONS = ["US", "Canada", "Australia", "NZ", "Brazil", "Ireland"]


def main():
    regions = [r.strip() for r in sys.argv[1:]] or DEFAULT_REGIONS

    # Force ingestion on, even if env says otherwise — this script's whole
    # purpose is to populate the cache.
    airRepo.INGEST_ON_MISS = True

    airRepo.init_db()

    print(f"Backend: {airRepo.BACKEND}")
    print(f"Regions: {', '.join(regions)}")
    print()

    for region in regions:
        print(f"=== Seeding {region} ===")
        try:
            airRepo.execute_region_ingestion(region)
        except Exception as e:
            print(f"[-] Region {region} crashed: {e}")
        print()

    print("[+] Seed run complete.")


if __name__ == "__main__":
    main()
