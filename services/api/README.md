# API service

Engineer B owns the REST API and PostgreSQL schema.

## Local development

```powershell
pnpm.cmd --filter @room2store/api dev
```

Set `DATABASE_URL` to use PostgreSQL. Without it, `USE_IN_MEMORY_DB=true` starts
the API with a fixture-friendly in-memory repository.

## Endpoints

- `GET /health`
- `POST|GET|PATCH /campaigns`
- `GET|POST /campaigns/:campaignId/items`
- `PATCH /items/:itemId`
- `POST|GET /items/:itemId/price-evidence`
- `POST|GET /items/:itemId/verdict`
- `POST /orders`
- `GET /campaigns/:campaignId/events`
