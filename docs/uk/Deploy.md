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
fly machine start 287e605a090218 --app ai-job-processor
```

# Volumes

fly volumes create redis_data --region arn --size 1

# Logs

fly auth login
fly auth token
fly logs
fly machines list
fly machines stop
fly platform regions
fly machines list --app ai-job-processor
fly status -a ai-job-processor-redis
fly volumes list -a ai-job-processor-redis
fly secrets set REDIS_FAMILY=6 --app ai-job-processor

# Instances

fly status --app ai-job-processor (web, worker)
fly status --app ai-job-processor-redis ()

```
Машина | Процес | Роль
ai-job-processor-redis, Redis Engine, "Data Store & Message Broker.
Тут живуть твої черги BullMQ. Те, що вона ""aren't part of Fly Launch"", означає, що вона була створена як окремий сервіс (можливо, через fly redis create), що правильно — вона має свій життєвий цикл."

web (287e...), server.js, "API Gateway & Cron. Приймає HTTP запити, створює джоби в Redis і керує розкладом (Cron)."

worker (48e7...), worker/index.js, Heavy Lifter. Постійно слухає Redis і виконує процесинг. Він не має відкритих портів і не пропускає через себе HTTP трафік.
```
