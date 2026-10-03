"""Vercel entrypoint for the ResourceX backend.

The backend is its own Vercel project, created from this repo with Root Directory = the repo root (the website is the
other project, with Root Directory = frontend). Vercel finds the FastAPI `app` here and installs requirements.txt.
Setup steps: backend/DEPLOY.md. Locally you can also run `uvicorn app:app --reload` from the repo root.
"""

from backend.app.main import app  # noqa: F401
