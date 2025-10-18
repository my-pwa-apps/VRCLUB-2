# VR Club Multiplayer Server Deployment Guide

## Overview
The VR Club multiplayer system uses a **WebSocket server** to synchronize players, avatars, VJ controls, and audio across multiple clients in real-time.

## Server Architecture
- **Technology**: Node.js + WebSocket (ws library)
- **Port**: 8080 (local) / 10000 (production)
- **Features**:
  - Real-time player position/rotation sync
  - VR headset + hand tracking sync
  - VJ control synchronization (lights, lasers, mirror ball)
  - Audio streaming sync
  - Player join/leave notifications
  - Up to 50+ concurrent players

## Free Deployment with Render.com

### Step 1: Sign up for Render
1. Go to [render.com](https://render.com)
2. Sign up with GitHub account (easiest)
3. Authorize Render to access your GitHub repos

### Step 2: Connect Your Repository
1. Click **"New +"** → **"Web Service"**
2. Select **VRCLUB-2** repository
3. Choose **network** branch (has multiplayer code)

### Step 3: Configure Service
Render will auto-detect the `render.yaml` file. Verify these settings:

- **Name**: `vrclub-multiplayer-server`
- **Runtime**: Node
- **Build Command**: `cd server && npm install`
- **Start Command**: `cd server && npm start`
- **Port**: 10000 (auto-configured)

### Step 4: Deploy!
1. Click **"Create Web Service"**
2. Render will:
   - Clone your repo
   - Install dependencies
   - Start the WebSocket server
   - Assign a public URL like: `https://vrclub-multiplayer-server.onrender.com`

### Step 5: Get Your Server URL
1. Once deployed, copy your Render URL (e.g., `vrclub-multiplayer-server.onrender.com`)
2. Your **WebSocket URL** is: `wss://vrclub-multiplayer-server.onrender.com` (note: `wss://` for secure WebSocket)

### Step 6: Update Client
In your VR Club app:
1. Open multiplayer menu (top-left)
2. Change server URL from `ws://localhost:8080` to `wss://YOUR-RENDER-URL.onrender.com`
3. Click **Connect**
4. You're live!

## Alternative: Update Default Server URL

To make the deployed server the default for all users, update `index.html`:

```html
<!-- Change this line (around line 869): -->
<input type="text" id="serverUrl" value="wss://vrclub-multiplayer-server.onrender.com">
```

## Health Check
Monitor your server health at: `https://your-app.onrender.com/health`

Returns:
```json
{
  "status": "ok",
  "connectedPlayers": 3,
  "uptime": 86400,
  "timestamp": 1697654321000
}
```

## Render Free Tier Limits
- ✅ **750 hours/month** (enough for 24/7 uptime)
- ✅ **Unlimited** concurrent connections
- ✅ Auto-sleep after 15 min inactivity (wakes up in ~30 seconds)
- ✅ Auto-deploy on GitHub push

## Local Development
For testing locally:

```powershell
cd server
npm install
npm start
```

Server runs at `ws://localhost:8080`

## Troubleshooting

### Server won't start
- Check `server/package.json` has correct dependencies
- Verify Node version ≥ 16
- Check Render logs for errors

### Can't connect from client
- Use `wss://` (secure) not `ws://` for production
- Check firewall/browser console for errors
- Verify server URL is correct

### Server goes to sleep
- Render free tier sleeps after 15min inactivity
- First connection wakes it up (~30 seconds)
- Upgrade to paid tier ($7/mo) for always-on

## Monitoring
- **Render Dashboard**: View logs, metrics, deployments
- **Health endpoint**: `https://your-app.onrender.com/health`
- **Browser console**: Check WebSocket connection status

## Security Notes
- Server validates all messages
- No authentication (anyone can connect)
- Consider adding username/password if needed
- Rate limiting built-in (20Hz position updates)

## Cost Breakdown
| Service | Free Tier | Paid Tier |
|---------|-----------|-----------|
| Render.com | 750 hrs/month | $7/mo (always-on) |
| **Total** | **$0/month** | **$7/month** |

## Next Steps
1. Deploy server to Render
2. Update client with deployed URL
3. Share link with friends
4. Test multiplayer in VR!

## Support
- Render Docs: https://render.com/docs
- WebSocket Docs: https://github.com/websockets/ws
- VR Club Issues: https://github.com/my-pwa-apps/VRCLUB-2/issues
