"""Write backend/data/locality_coords.csv: a suburb-centre coordinate for every locality in the spreadsheets.

Most businesses in the dataset have no published coordinates (only NPI-listed facilities do), but the map and
distance matching need one for every row. This looks up each (locality, postcode) in the community postcode
dataset at https://github.com/matthewproctor/australianpostcodes and keeps only the localities we use.

Usage (from the repo root, needs internet):
    python backend/scripts/geocode_localities.py

Re-run it when the spreadsheets add new localities; load_db.py reads the CSV it writes.
"""

import csv
import io
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from load_db import REPO_ROOT, find_default, read_rows  # noqa: E402

SOURCE = "https://raw.githubusercontent.com/matthewproctor/australianpostcodes/master/australian_postcodes.csv"
OUT = REPO_ROOT / "backend" / "data" / "locality_coords.csv"


def main() -> None:
    wanted = set()
    for pattern, sheet in (("NSW_Steel_Scrap_Producers*.xlsx", "Producers"), ("NSW_Steel_Scrap_Manufacturers*.xlsx", "Manufacturers")):
        for r in read_rows(find_default(pattern), sheet):
            wanted.add((str(r["NSW locality"]).strip().upper(), r["Postcode"] and str(r["Postcode"])))

    with urllib.request.urlopen(SOURCE) as resp:
        rows = list(csv.DictReader(io.TextIOWrapper(resp, encoding="utf-8")))

    exact, by_locality = {}, {}
    for r in rows:
        if r["state"] != "NSW":
            continue
        try:
            lat, lng = float(r["Lat_precise"] or r["lat"]), float(r["Long_precise"] or r["long"])
        except ValueError:
            continue
        if not lat or not lng:
            continue
        key = r["locality"].strip().upper()
        exact.setdefault((key, r["postcode"]), (lat, lng))
        by_locality.setdefault(key, (lat, lng))

    out, missing = [], []
    for locality, postcode in sorted(wanted, key=lambda k: (k[0], k[1] or "")):
        coords = exact.get((locality, postcode)) or by_locality.get(locality)
        if coords:
            out.append((locality, postcode or "", round(coords[0], 5), round(coords[1], 5)))
        else:
            missing.append(f"{locality} {postcode or ''}".strip())

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["locality", "postcode", "lat", "lng"])
        w.writerows(out)
    print(f"Wrote {len(out)} localities to {OUT}")
    if missing:
        print("No coordinates for:", ", ".join(missing))


if __name__ == "__main__":
    main()
