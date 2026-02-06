# Director's Console - Docker Deployment

## Development vs Docker

| Mode | Command | Frontend | Access |
|------|---------|----------|--------|
| **Development** | `.\venv\Scripts\python.exe .\start.py` | Vite dev server (5173) | http://localhost:5173 |
| **Docker** | `docker-compose up -d` | Built static files | http://localhost:8000 |

In development, `start.py` runs:
- CPE Backend on port 8000
- Vite dev server on port 5173 (hot reload)
- Orchestrator on port 8020

In Docker, the frontend is **pre-built** and served statically from FastAPI, so you only need port 8000.

## Quick Start

```bash
# 1. Create .env file with credentials
cp .env.docker.example .env
# Edit .env and set NAS_USER and NAS_PASS

# 2. Build and start (choose one):

# For NAS/Network shares (recommended):
docker-compose -f docker-compose.nas.yml up -d

# For local drives only:
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Project Folders

### For Network Shares (NAS) - Use docker-compose.nas.yml

Docker Desktop with WSL2 cannot access Windows-mapped network drives (like V:, R:). 
Instead, mount SMB shares directly:

1. Edit `docker-compose.nas.yml` and update the NAS IP addresses and share names:
   ```yaml
   nas1:
     driver: local
     driver_opts:
       type: cifs
       device: //192.168.195.50/Yavin_Prime  # ← Your NAS share
       o: username=${NAS_USER},password=${NAS_PASS},vers=3.0,uid=0,gid=0
   ```

2. Create `.env` with your NAS credentials:
   ```env
   NAS_USER=your_username
   NAS_PASS=your_password
   ```

3. Start with the NAS compose file:
   ```bash
   docker-compose -f docker-compose.nas.yml up -d
   ```

Inside the container, shares are available at:
- `/projects/nas1`, `/projects/nas2`, `/projects/nas3`, `/projects/nas4`

### For Local Drives Only - Use docker-compose.yml

If your projects are on local drives (not network), use the standard compose file:

```bash
# Edit .env
PROJECTS_PATH_1=C:/Users/YourName/Projects

# Start
docker-compose up -d
```

### Path Format Notes

- **Local Windows drives**: Use forward slashes: `C:/Users/Path` (not backslashes)
- **Network shares**: Map to a drive letter first (e.g., `Z:`) or configure Docker Desktop file sharing
- **Inside container**: Projects are available at `/projects`

## Services

| Service | Port | Description |
|---------|------|-------------|
| CPE | 8000 | Cinema Prompt Engineering (Backend + Frontend) |
| Orchestrator | 8020 | ComfyUI Job Manager / Render Farm **(optional)** |

## ComfyUI Node Configuration

**You don't need to configure nodes in YAML.** 

Use the **Node Manager** in the UI (System menu → Manage Nodes) to add your ComfyUI nodes. They're saved to browser localStorage and the frontend connects directly to ComfyUI.

The Orchestrator service is **optional** - it's only needed if you want:
- Job queuing and scheduling
- Parallel job execution via job groups
- Backend status monitoring via API

## Access

- **Director's Console**: http://localhost:8000
- **Orchestrator API**: http://localhost:8020

## Building Individual Images

```bash
# Build CPE image only
docker build -t directors-console-cpe -f Dockerfile .

# Build Orchestrator image only
docker build -t directors-console-orchestrator -f Dockerfile.orchestrator .
```

## Configuration

### Environment Variables

**CPE Service:**
- `CPE_API_PORT` - API port (default: 8000)

**Orchestrator Service (optional):**
- `ORCHESTRATOR_PORT` - API port (default: 8020)
- `COMFY_NODES` - Only needed for Orchestrator job queuing (e.g., `192.168.1.100:8188,192.168.1.101:8188`)

### Volumes

The following volumes are created for data persistence:

- `cpe-data` - CPE application data
- `cpe-templates` - Workflow templates
- `orchestrator-data` - Orchestrator database
- `orchestrator-inbox` - Job input folder
- `orchestrator-outbox` - Job output folder

### Custom Configuration

To use a custom Orchestrator config:

```yaml
# In docker-compose.yml, uncomment:
volumes:
  - ./Orchestrator/config.yaml:/app/config.yaml:ro
```

## Development

To mount local code for development:

```yaml
# In docker-compose.yml, add under cpe service:
volumes:
  - ./CinemaPromptEngineering/api:/app/api:ro
  - ./CinemaPromptEngineering/cinema_rules:/app/cinema_rules:ro
```

## Health Checks

Both services include health checks:

```bash
# Check CPE health
curl http://localhost:8000/api/health

# Check Orchestrator health
curl http://localhost:8020/health
```

## Networking

Both services are on the `directors-console` bridge network and can communicate using service names:
- CPE can reach Orchestrator at `http://orchestrator:8020`
- Orchestrator can reach CPE at `http://cpe:8000`

## Troubleshooting

### View container logs
```bash
docker-compose logs cpe
docker-compose logs orchestrator
```

### Rebuild after code changes
```bash
docker-compose build --no-cache
docker-compose up -d
```

### Check container status
```bash
docker-compose ps
```

### Shell into container
```bash
docker-compose exec cpe /bin/bash
docker-compose exec orchestrator /bin/bash
```
