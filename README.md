# Bade Pollution Dashboard

A small dashboard for monitoring and analyzing air odor reports in Bade District, Taoyuan.

## Features
- CSV data loading from a public Google Sheet
- Filter by location and concentration level
- KPI cards for totals and spike patterns
- Multiple Chart.js visualizations
- Auto-refresh every 10 minutes

## Run locally

From the project folder:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## Test

Run the regression checks before committing:

```bash
node --test test/app.test.js
```

## Files
- `index.html` – page markup
- `styles.css` – custom styling
- `app.js` – data parsing, chart rendering, and filtering logic
