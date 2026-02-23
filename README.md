# SC Bridge

A Star Citizen companion app — fleet management, loadout planning, and game reference data. Syncs ship data from [FleetYards.net](https://fleetyards.net), imports insurance data from [HangarXplor](https://github.com/dolkensp/HangarXPLOR), and provides fleet analysis with gap detection and redundancy tracking.

## Features

- **Ship Database Sync** — Nightly sync of all Star Citizen ships from the FleetYards API (~230+ ships)
- **Hangar Sync** — Automatic sync of your public FleetYards hangar
- **HangarXplor Import** — Upload JSON exports from the HangarXplor browser extension to enrich fleet data with insurance (LTI), pledge cost, and warbond status
- **Insurance Tracker** — Dashboard showing LTI vs non-LTI ships with full pledge history
- **Fleet Analysis** — Gap analysis identifying missing gameplay roles, redundancy detection, and optimisation suggestions
- **Ship Database Browser** — Searchable/filterable database of all Star Citizen ships

## Screenshots

> _Coming soon_

---

## Environment Variables

All configuration is done via environment variables. This makes it easy to configure in Docker, Docker Compose, or Kubernetes.

**Quick Start**: Copy `.env.example` to `.env` and customize for your environment.

### Server Configuration

| Variable | Default | Required | Description |
|---|---|---|---|
| `PORT` | `8080` | No | HTTP server listen port |
| `BASE_URL` | `http://localhost:8080` | No | Base URL of the application (used for generating links) |
| `STATIC_DIR` | `./frontend/dist` | No | Path to the built React frontend assets |

### Database Configuration

| Variable | Default | Required | Description |
|---|---|---|---|
| `DB_DRIVER` | `sqlite` | No | Database driver — `sqlite` or `postgres` |
| `DB_PATH` | `./data/fleet-manager.db` | No | SQLite database file path (only used when `DB_DRIVER=sqlite`) |
| `DATABASE_URL` | — | When `DB_DRIVER=postgres` | PostgreSQL connection string (e.g. `postgres://user:pass@host:5432/dbname?sslmode=disable`) |

### FleetYards API Configuration

| Variable | Default | Required | Description |
|---|---|---|---|
| `FLEETYARDS_BASE_URL` | `https://api.fleetyards.net` | No | FleetYards API base URL |
| `FLEETYARDS_USER` | — | No | Your FleetYards username — enables public hangar sync option |

### SC Wiki API Configuration

| Variable | Default | Required | Description |
|---|---|---|---|
| `SC_WIKI_ENABLED` | `true` | No | Enable SC Wiki API sync for ship/component reference data |
| `SC_WIKI_RATE_LIMIT` | `1.0` | No | SC Wiki API rate limit (requests per second) |
| `SC_WIKI_BURST` | `5` | No | SC Wiki API burst size (max concurrent requests) |

### Sync Configuration

| Variable | Default | Required | Description |
|---|---|---|---|
| `SYNC_SCHEDULE` | `0 3 * * *` | No | Cron expression for the nightly sync schedule (default: 3:00 AM) |
| `SYNC_ON_STARTUP` | `true` | No | If `true`, runs an initial sync when the app starts and the database is empty |

---

## Deployment

### Option 1: Docker Compose

The simplest way to run Fleet Manager locally or on a standalone server.

```bash
git clone https://github.com/nzvengeance/fleet-manager.git
cd fleet-manager
docker compose up -d
```

Open [http://localhost:8080](http://localhost:8080)

The default `docker-compose.yml` uses SQLite, which stores its database in a named Docker volume. No external database required.

#### Using PostgreSQL with Docker Compose

Uncomment the `postgres` service in `docker-compose.yml` and update the `fleet-manager` service environment:

```yaml
services:
  fleet-manager:
    # ...
    environment:
      DB_DRIVER: postgres
      DATABASE_URL: "postgres://fleet:changeme@postgres:5432/fleet_manager?sslmode=disable"
    depends_on:
      - postgres

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: fleet_manager
      POSTGRES_USER: fleet
      POSTGRES_PASSWORD: changeme
    volumes:
      - pg-data:/var/lib/postgresql/data

volumes:
  pg-data:
```

---

### Option 2: Kubernetes with Flux + BJW-S App Template

This is the recommended approach for GitOps-managed home labs running Flux. The examples below follow the standard home-ops repo conventions.

#### Prerequisites

- A Kubernetes cluster managed by [Flux](https://fluxcd.io/)
- The [BJW-S app-template](https://github.com/bjw-s-labs/helm-charts) available as an `OCIRepository` (or `HelmRepository`)
- The Fleet Manager container image pushed to a registry (see [Building the Image](#building-the-image))
- (Optional) [Rook Ceph](https://rook.io/) or another CSI provider for persistent storage
- (Optional) [CloudNative PostgreSQL](https://cloudnative-pg.io/) if using postgres mode

#### Directory Structure

Add the following to your home-ops repo:

```
kubernetes/main/apps/default/fleet-manager/
├── app/
│   ├── helmrelease.yaml
│   └── kustomization.yaml
└── ks.yaml
```

#### `ks.yaml`

The Flux Kustomization that controls the app deployment:

```yaml
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: &app fleet-manager
  namespace: flux-system
spec:
  targetNamespace: default
  commonMetadata:
    labels:
      app.kubernetes.io/name: *app
  dependsOn:
    - name: rook-ceph-cluster
  path: ./kubernetes/main/apps/default/fleet-manager/app
  prune: true
  sourceRef:
    kind: GitRepository
    name: home-ops
  wait: false
  interval: 30m
  retryInterval: 1m
  timeout: 5m
```

#### `app/kustomization.yaml`

```yaml
---
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - helmrelease.yaml
```

---

#### Example HelmRelease — SQLite (Simplest)

This is the easiest way to deploy. Uses a single PVC for the SQLite database, no external database dependencies.

```yaml
---
# yaml-language-server: $schema=https://raw.githubusercontent.com/bjw-s-labs/helm-charts/main/charts/other/app-template/schemas/helmrelease-helm-v2.schema.json
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: &app fleet-manager
spec:
  interval: 30m
  chartRef:
    kind: OCIRepository
    name: app-template
  install:
    remediation:
      retries: 3
  upgrade:
    cleanupOnFail: true
    remediation:
      strategy: rollback
      retries: 3
  dependsOn:
    - name: rook-ceph-cluster
      namespace: rook-ceph
  values:
    controllers:
      fleet-manager:
        annotations:
          reloader.stakater.com/auto: "true"
        containers:
          app:
            image:
              repository: ghcr.io/nzvengeance/fleet-manager
              tag: latest
            env:
              TZ: Pacific/Auckland
              PORT: "8080"
              DB_DRIVER: sqlite
              DB_PATH: /app/data/fleet-manager.db
              FLEETYARDS_BASE_URL: https://api.fleetyards.net
              FLEETYARDS_USER: NZVengeance
              SYNC_SCHEDULE: "0 3 * * *"
              SYNC_ON_STARTUP: "true"
              STATIC_DIR: /app/frontend/dist
            probes:
              liveness: &probes
                enabled: true
                custom: true
                spec:
                  httpGet:
                    path: /api/health
                    port: &port 8080
                  initialDelaySeconds: 5
                  periodSeconds: 30
                  timeoutSeconds: 5
                  failureThreshold: 3
              readiness: *probes
            securityContext:
              allowPrivilegeEscalation: false
              readOnlyRootFilesystem: false
              capabilities: { drop: ["ALL"] }
            resources:
              requests:
                cpu: 10m
                memory: 64Mi
              limits:
                memory: 256Mi

    service:
      app:
        controller: fleet-manager
        ports:
          http:
            port: *port

    ingress:
      app:
        className: internal
        annotations:
          external-dns.alpha.kubernetes.io/target: internal.${SECRET_DOMAIN}
        hosts:
          - host: fleet.${SECRET_DOMAIN}
            paths:
              - path: /
                service:
                  identifier: app
                  port: http

    persistence:
      data:
        existingClaim: fleet-manager
        globalMounts:
          - path: /app/data
```

---

#### Example HelmRelease — PostgreSQL with CNPG

If you run [CloudNative PostgreSQL](https://cloudnative-pg.io/), you can use it instead of SQLite. This is better for reliability and lets VolSync/pgdump handle backups natively.

The key differences from the SQLite version are highlighted with comments:

```yaml
---
# yaml-language-server: $schema=https://raw.githubusercontent.com/bjw-s-labs/helm-charts/main/charts/other/app-template/schemas/helmrelease-helm-v2.schema.json
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: &app fleet-manager
spec:
  interval: 30m
  chartRef:
    kind: OCIRepository
    name: app-template
  install:
    remediation:
      retries: 3
  upgrade:
    cleanupOnFail: true
    remediation:
      strategy: rollback
      retries: 3
  dependsOn:
    - name: rook-ceph-cluster
      namespace: rook-ceph
    - name: cloudnative-pg          # Wait for CNPG operator
      namespace: database
  values:
    controllers:
      fleet-manager:
        annotations:
          reloader.stakater.com/auto: "true"
        containers:
          app:
            image:
              repository: ghcr.io/nzvengeance/fleet-manager
              tag: latest
            env:
              TZ: Pacific/Auckland
              PORT: "8080"
              # --- PostgreSQL mode ---
              DB_DRIVER: postgres
              DATABASE_URL:                    # Injected from CNPG secret
                valueFrom:
                  secretKeyRef:
                    name: fleet-manager-db-app
                    key: uri
              FLEETYARDS_BASE_URL: https://api.fleetyards.net
              FLEETYARDS_USER: NZVengeance
              SYNC_SCHEDULE: "0 3 * * *"
              SYNC_ON_STARTUP: "true"
              STATIC_DIR: /app/frontend/dist
            probes:
              liveness: &probes
                enabled: true
                custom: true
                spec:
                  httpGet:
                    path: /api/health
                    port: &port 8080
                  initialDelaySeconds: 5
                  periodSeconds: 30
                  timeoutSeconds: 5
                  failureThreshold: 3
              readiness: *probes
            securityContext:
              allowPrivilegeEscalation: false
              readOnlyRootFilesystem: false
              capabilities: { drop: ["ALL"] }
            resources:
              requests:
                cpu: 10m
                memory: 64Mi
              limits:
                memory: 256Mi

    service:
      app:
        controller: fleet-manager
        ports:
          http:
            port: *port

    ingress:
      app:
        className: internal
        annotations:
          external-dns.alpha.kubernetes.io/target: internal.${SECRET_DOMAIN}
        hosts:
          - host: fleet.${SECRET_DOMAIN}
            paths:
              - path: /
                service:
                  identifier: app
                  port: http

    # No persistence block needed — database is in CNPG
```

Add the CNPG `Cluster` resource alongside the HelmRelease (or in a shared database namespace). Add it to `kustomization.yaml` as well:

```yaml
# app/cnpg.yaml
---
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: fleet-manager-db
spec:
  instances: 1
  storage:
    size: 2Gi
    storageClass: ceph-block
  bootstrap:
    initdb:
      database: fleet_manager
      owner: fleet_manager
```

CNPG automatically creates a secret named `fleet-manager-db-app` containing the connection URI.

---

#### Envoy Gateway Variant

If you use Envoy Gateway instead of an Ingress controller, remove the entire `ingress` block from the HelmRelease and create an `HTTPRoute` as a separate file:

```yaml
# app/httproute.yaml
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: fleet-manager
  annotations:
    external-dns.alpha.kubernetes.io/target: internal.${SECRET_DOMAIN}
spec:
  parentRefs:
    - name: internal
      namespace: network
      sectionName: https
  hostnames:
    - fleet.${SECRET_DOMAIN}
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: fleet-manager
          port: 8080
```

Update `kustomization.yaml` to include it:

```yaml
---
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - helmrelease.yaml
  - httproute.yaml
```

---

#### VolSync Backup (Optional)

If you use [VolSync](https://volsync.readthedocs.io/) for PVC backups (SQLite mode only — CNPG handles its own backups), create the PVC with a `ReplicationDestination` data source:

```yaml
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: fleet-manager
spec:
  accessModes: ["ReadWriteOnce"]
  dataSourceRef:
    kind: ReplicationDestination
    apiGroup: volsync.backube
    name: fleet-manager-rdst
  resources:
    requests:
      storage: 1Gi
  storageClassName: ceph-block
```

---

### Option 3: Plain Docker

```bash
docker build -t fleet-manager:latest .

docker run -d \
  --name fleet-manager \
  -p 8080:8080 \
  -v fleet-data:/app/data \
  -e FLEETYARDS_USER=YourFleetYardsUsername \
  fleet-manager:latest
```

---

## Building the Image

### Locally

```bash
docker build -t fleet-manager:latest .
```

### GitHub Actions (CI/CD)

The repo includes a GitHub Actions workflow (`.github/workflows/build.yml`) that builds multi-arch images (`linux/amd64` + `linux/arm64`) and pushes to GitHub Container Registry on every push to `main`:

```
ghcr.io/<your-github-username>/fleet-manager:latest
ghcr.io/<your-github-username>/fleet-manager:<commit-sha>
```

To use it:

1. Fork or clone this repo to your GitHub account
2. GitHub Actions `packages: write` permission is available by default
3. Push to `main` — the image builds and pushes automatically
4. Update the `image.repository` in your HelmRelease to point at your GHCR image

---

## Development

### Prerequisites

- Go 1.22+
- Node.js 22+

### Run Locally

```bash
# Terminal 1: Backend
go mod tidy
go run ./cmd/server

# Terminal 2: Frontend (with hot reload)
cd frontend
npm install
npm run dev
```

The Vite dev server on `:5173` proxies `/api` requests to the Go backend on `:8080` automatically.

### Build for Production

```bash
make build    # Build both frontend + backend
make dev      # Run both in dev mode
make docker   # Build Docker image
make clean    # Remove build artifacts
```

---

## API Reference

### System Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check (used by k8s liveness/readiness probes) |
| `GET` | `/api/status` | System status — ship count, vehicle count, sync history, config |

### Ship Database

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/ships` | List all ships in database |
| `GET` | `/api/ships/{slug}` | Get a single ship by FleetYards slug |

### Fleet Management

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/vehicles` | List vehicles in your hangar |
| `GET` | `/api/vehicles/with-insurance` | Vehicles joined with HangarXplor insurance data |
| `GET` | `/api/analysis` | Fleet gap analysis, redundancy detection, insurance summary |

### Data Import

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/import/hangarxplor` | Import HangarXplor JSON (send the array as the request body) |
| `GET` | `/api/import/hangarxplor` | Get current HangarXplor import data |
| `DELETE` | `/api/import/hangarxplor` | Clear all HangarXplor import data |

### Sync Management

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/sync/status` | FleetYards sync history (last 10 entries) |
| `GET` | `/api/sync/sc-wiki-status` | SC Wiki API sync status (manufacturers, vehicles, items) |
| `POST` | `/api/sync/ships` | Trigger a manual FleetYards ship database sync |
| `POST` | `/api/sync/hangar` | Trigger a manual FleetYards hangar sync |
| `POST` | `/api/sync/scwiki` | Trigger a manual SC Wiki API sync (components, ships, manufacturers) |
| `POST` | `/api/sync/enrich` | Enrich HangarXplor data with FleetYards metadata |

---

## Roadmap

- [ ] CCU chain planner / melt calculator
- [ ] CCU Game extension integration
- [ ] Ship comparison tool
- [ ] Multi-user support
- [ ] Webhook notifications for new ship sales
- [ ] aUEC price tracking from in-game data

---

## License

MIT
