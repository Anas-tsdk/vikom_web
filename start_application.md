# Terminal 1 backend
cd /Users/sam/Developer/vikom_web
dotnet run --project backend --launch-profile http

# The API's SQLite path is rooted at backend/, regardless of this terminal's
# working directory. If port 5084 is already in use, inspect the exact process
# before stopping it (an old checkout can keep running after the folder moves):
#   lsof -nP -iTCP:5084 -sTCP:LISTEN
#   ps -p <pid> -o pid,command
# If it is an obsolete ViKom backend, stop that exact PID gracefully:
#   kill -TERM <pid>
# Then rerun the backend and confirm http://localhost:5084/swagger.

# Terminal 2 - frontend
cd /Users/sam/Developer/vikom_web/frontend
npm run build

env __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=vikom-demo.framenex.com \
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort

# Terminal 3
# The tunnel config selects HTTP/2 because this network blocks QUIC/UDP.
# Keep this process running while the public site is in use.
cloudflared tunnel --config /Users/sam/.cloudflared/config.yml run vikom-demo

Login Nurse Nora: 
nurse@homecare.local
Pass123!