# Production deployment

The application is deployed as one Node service. It serves the Vite build, REST API, WebSocket chat, SQLite database, and uploads from the same origin.

## Render

1. Create a new Render Blueprint from this repository. `render.yaml` is included.
2. Set `FRONTEND_URL` to the service URL, for example `https://bayader.onrender.com`.
3. Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME` in the Render environment.
4. Keep the persistent disk mounted at `/data`; otherwise the SQLite database is lost on redeploy.
5. New account creation is Google-only. Set `GOOGLE_CLIENT_ID` on Render and the GitHub Actions repository variable `VITE_GOOGLE_CLIENT_ID` before deploying the frontend.

## Docker

```sh
docker build -t bayader .
docker run -d --name bayader -p 5199:5199 \
  -e FRONTEND_URL=https://your-domain.example \
  -e JWT_SECRET=replace-with-a-random-value-at-least-32-characters \
  -e ADMIN_EMAIL=admin@example.com \
  -e ADMIN_PASSWORD=change-this-password \
  -v bayader-data:/data -v bayader-uploads:/app/server/uploads \
  bayader
```
