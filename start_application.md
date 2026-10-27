# Start the local ViKom site and public demo tunnel
#
# If these processes are already running, stop the old backend and frontend
# Preview first with Ctrl+C. A backend can outlive its terminal, so check its
# port before starting it; rebuilding files does not update code in a running
# backend process. Then use three separate terminals.

# Before Terminal 1, check whether an old backend is still listening:
#   lsof -nP -iTCP:5084 -sTCP:LISTEN
# If there is a listener, inspect its exact PID:
#   ps -p <PID> -o pid,lstart,command
# Only if it is the old ViKom backend from this checkout, stop that exact PID:
#   kill -TERM <PID>
# Confirm port 5084 is free before starting the backend below.

# Terminal 1 - backend
cd /Users/sam/Developer/vikom_web
dotnet run --project backend --launch-profile http
# This Development launch profile applies pending EF Core migrations at startup.
# Keep this terminal running. Backend code changes take effect after restarting it.

# The API's SQLite path is rooted at backend/, regardless of this terminal's
# working directory. Confirm it started at http://localhost:5084/swagger.

# Terminal 2 - build the latest frontend and serve it
cd /Users/sam/Developer/vikom_web/frontend
npm run lint
npm run build

env __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=vikom-demo.framenex.com npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
# Keep this terminal running. Re-run the build and restart Preview after frontend
# source changes; refreshing the browser alone does not rebuild the frontend.
# After a frontend update, hard-refresh the public site to bypass a previously
# cached page (macOS: Cmd+Shift+R; Windows/Linux: Ctrl+Shift+R). Cloudflare is
# currently returning a 4-hour browser cache lifetime for the HTML. For a
# permanent fix, change the Cloudflare Browser Cache TTL to "Respect Existing
# Headers" (or use a Cache Rule for HTML with Browser TTL set to "Respect
# origin"). Vite Preview already sends no-cache for the HTML document.
#
# Before committing backend changes, run the backend test suite from the repo:
#   cd /Users/sam/Developer/vikom_web
#   dotnet test backend.Tests/backend.Tests.csproj

# Terminal 3 - public HTTPS tunnel
# The tunnel config selects HTTP/2 because this network blocks QUIC/UDP.
# Keep this process running while the public site is in use.
cloudflared tunnel --config /Users/sam/.cloudflared/config.yml run vikom-demo

# Development login for local testing:
# Nurse Nora
# Username: nurse@homecare.local
# Password: Pass123!