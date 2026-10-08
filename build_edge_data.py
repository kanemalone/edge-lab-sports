
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API_URL = "https://api.the-odds-api.com/v4/sports"
API_KEY = os.environ.get("ODDS_API_KEY", "").strip()
REGION = os.environ.get("ODDS_REGION", "au").strip()
MARKETS = os.environ.get("ODDS_MARKETS", "h2h,spreads,totals").strip()

SPORTS = [
    ("aussierules_afl", "AFL"),
    ("rugbyleague_nrl", "NRL"),
    ("basketball_nba", "NBA"),
    ("basketball_nbl", "NBL"),
    ("americanfootball_nfl", "NFL"),
    ("baseball_mlb", "MLB"),
    ("icehockey_nhl", "NHL"),
    ("soccer_epl", "English Premier League"),
    ("tennis_atp", "ATP Tennis"),
    ("tennis_wta", "WTA Tennis"),
]

OUTPUT_PATHS = [
    Path("data/edge-data.json"),
    Path("edge-data.json"),
]


def fetch_sport(sport_key):
    params = urlencode({
        "apiKey": API_KEY,
        "regions": REGION,
        "markets": MARKETS,
        "oddsFormat": "decimal",
        "dateFormat": "iso",
    })

    url = f"{API_URL}/{sport_key}/odds/?{params}"
    request = Request(
        url,
        headers={"User-Agent": "EdgeLabSports/1.0"},
    )

    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def main():
    if not API_KEY:
        print("ERROR: ODDS_API_KEY is missing or empty.")
        print("Check GitHub Settings > Secrets and variables > Actions.")
        sys.exit(1)

    generated_at = datetime.now(timezone.utc).isoformat()
    sports_data = []
    all_events = []
    errors = []

    for sport_key, sport_name in SPORTS:
        print(f"Fetching {sport_name} ({sport_key})...")

        try:
            events = fetch_sport(sport_key)

            if not isinstance(events, list):
                raise ValueError("Unexpected API response format")

            sports_data.append({
                "key": sport_key,
                "name": sport_name,
                "event_count": len(events),
                "events": events,
            })

            for event in events:
                event["sport_key"] = sport_key
                event["sport_title"] = sport_name
                all_events.append(event)

            print(f"  Retrieved {len(events)} events.")

        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            message = (
                f"{sport_key}: HTTP {exc.code} - {detail[:500]}"
            )
            errors.append(message)
            print(f"  ERROR: {message}")

            if exc.code == 401:
                print(
                    "  Check that your Odds API key is valid "
                    "and is being passed correctly."
                )

        except (URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
            message = f"{sport_key}: {exc}"
            errors.append(message)
            print(f"  ERROR: {message}")

    # Do not overwrite existing data if every API request failed.
    if not sports_data:
        print("ERROR: No sports data retrieved. Existing data was preserved.")
        sys.exit(1)

    payload = {
        "generated_at": generated_at,
        "source": "The Odds API",
        "region": REGION,
        "markets_requested": MARKETS.split(","),
        "sports_count": len(sports_data),
        "event_count": len(all_events),
        "sports": sports_data,
        "events": all_events,
        "errors": errors,
        "data_status": "partial" if errors else "success",
        "model_probabilities_available": False,
    }

    # Create the directories before writing files.
    for output_path in OUTPUT_PATHS:
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with output_path.open("w", encoding="utf-8") as file:
            json.dump(payload, file, separators=(",", ":"), ensure_ascii=False)

        print(f"Saved {output_path}")

    print(
        f"Finished: {len(sports_data)} sports, "
        f"{len(all_events)} events, {len(errors)} errors."
    )


if __name__ == "__main__":
    main()
