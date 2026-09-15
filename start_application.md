# Terminal 1 backend
cd /Users/sam/Developer/vikom-web-main
dotnet run --project backend --launch-profile http


# Terminal 2 - frontend
cd /Users/sam/Developer/vikom-web-main/frontend
npm run build

env __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=vikom-demo.framenex.com \
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort

# Terminal 3
cloudflared tunnel --config /Users/sam/.cloudflared/config.yml run vikom-demo

Login Nurse Nora: 
nurse@homecare.local
Pass123!
