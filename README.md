# Bhasha Shiksha Setu — Frontend

Frontend-only version of the Bhasha Shiksha Setu project.

## Structure

```text
bhasha-shiksha-setu-frontend/
├── index.html
├── student.html
├── teacher.html
├── tutor.html
├── script.js
├── CSS/
│   └── style.css
├── images/
└── README.md
```

> Your source project may contain additional frontend assets. They are preserved when they are HTML/CSS/JS/images/JSON and are outside backend/server folders.

## Backend

The backend is intentionally NOT included in this repository.

After deploying the backend, update the `API_BASE_URL` value in `script.js`:

```js
const API_BASE_URL = "https://YOUR-BACKEND-URL.onrender.com";
```

## GitHub

Create a repository named:

`bhasha-shiksha-setu-frontend`

Upload the contents of this folder to the repository root.

Do not upload backend files such as `app.py`, `requirements.txt`, `Procfile`, `.env`, or the `backend/` folder.

## Render Static Site

1. Open Render.
2. Select **New → Static Site**.
3. Connect the GitHub repository.
4. Branch: `main`
5. Root Directory: leave empty.
6. Build Command: leave empty.
7. Publish Directory: `.`
8. Deploy.

Because this is a static HTML/CSS/JavaScript frontend, no Python, Flask, Node.js, or database is required to deploy the frontend.

## Local testing

You can open `index.html` directly in a browser for basic UI testing.

For more reliable local testing, use VS Code with the Live Server extension.
