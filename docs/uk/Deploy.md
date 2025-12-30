# Secrets

```
set -a
source .env.production
set +a

fly secrets set --app ai-job-processor \
 DATABASE_URL="$DATABASE_URL" \
  SUPABASE_URL="$SUPABASE_URL" \
 SUPABASE_PUBLISHEBLE_KEY="$SUPABASE_PUBLISHEBLE_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
 REDIS_URL="$REDIS_URL" \
  BULLMQ_QUEUE_LITE="$BULLMQ_QUEUE_LITE" \
 BULLMQ_QUEUE_HARD="$BULLMQ_QUEUE_HARD" \
  GEMINI_API_KEY="$GEMINI_API_KEY" \
 INTERNAL_API_KEY="$INTERNAL_API_KEY"
```

Check:

```
fly secrets list --app ai-job-processor
```

# Deploy

```
fly deploy
```

# Volumes

fly volumes create redis_data --region arn --size 1

# Logs

fly logs
fly machines list
fly machines stop
fly platform regions
