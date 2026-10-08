EDGE LAB SPORTS — V0.2

This package keeps the V0.1 dark terminal design and adds the live-data foundation.

WHAT V0.2 ADDS
- Unified data schema in data/edge-data.json
- Sports events + bookmaker market prices
- Best available price per selection
- Raw implied probability
- De-vigged market fair probability where a complete selection set is available
- Model probability / edge / EV fields ready for sport-specific models
- Shared frontend data loader in app.js
- GitHub Actions refresh every 15 minutes
- The Odds API integration for sports
- Racing remains a separate connector/model layer

GITHUB SETUP
1. Upload/replace the V0.2 files in the edge-lab-sports repository.
2. In GitHub: Settings > Secrets and variables > Actions > New repository secret.
3. Name the secret: ODDS_API_KEY
4. Paste your Odds API key as the value.
5. Run Actions > Update Edge Lab data > Run workflow.
6. After the first successful run, data/edge-data.json will contain live sports markets.

IMPORTANT
- Never put the API key in HTML or JavaScript.
- This version intentionally does NOT invent model probabilities. Until a sport-specific model exists, model_probability, edge and EV remain null.
- Racing needs a separate racing data provider/API.
- Estimated edges are research signals, not guarantees of profitable outcomes.
