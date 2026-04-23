# Local Python Frontend Test Suite

This folder contains a Python-based frontend test manager and smoke tests that simulate a user using the app in a browser.

## Install

From the repo root:

```powershell
python -m pip install -r tests/requirements.txt
python -m playwright install chromium
```

## Run tests

Start the local frontend server first:

```powershell
npm run dev
```

Then run:

```powershell
pytest tests
```

Or from npm:

```powershell
npm run test:python
```

## Configuration

- `FRONTEND_TEST_URL` can be set to target a different local URL.
- The test harness uses Playwright to open the browser and verify page content.
