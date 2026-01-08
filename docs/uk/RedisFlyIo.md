# Ось що можна перевірити для Redis на Fly (з volume):

## Підключитись і подивитись конфіг Redis (persistence + memory policy):

```
fly ssh console -C 'redis-cli INFO persistence'
fly ssh console -C 'redis-cli INFO memory'
fly ssh console -C 'redis-cli CONFIG GET dir'
fly ssh console -C 'redis-cli CONFIG GET appendonly'
fly ssh console -C 'redis-cli CONFIG GET save'
fly ssh console -C 'redis-cli CONFIG GET maxmemory maxmemory-policy'
```

- appendonly yes + dir покаже, чи включений AOF і куди пишеться (на volume).
- save покаже RDB snapshot правила.
- maxmemory і maxmemory-policy — ліміт і стратегія очищення (noeviction, volatile-lru, allkeys-lru тощо).

## Обсяг диска/volume на VM:

```
fly ssh console -C 'df -h'
fly ssh console -C 'ls -lh $(redis-cli CONFIG GET dir | tail -n1)'
```

Так побачиш, скільки займають RDB/AOF файли на примонтованому volume.

## Якщо потрібен опис volume у Fly:

fly volumes list
fly volumes show <volume-name-or-id>
(дасть розмір, регіон, точки монтування).

### Якщо Redis — не наш контейнер, а Managed (Supabase тощо), дивись їхню документацію: потрібні CONFIG GET/INFO дозволи або їхня панель.

Суть: Redis пише на volume, якщо включено AOF/RDB і dir вказує на точку монтування. Схема очищення — через maxmemory/maxmemory-policy. Якщо maxmemory не виставлено, Redis може рости до заповнення диска, тоді потрібен моніторинг або ручний ліміт.

## Якщо на машині немає redis-cli. Можна обійтися через node/ioredis:

### INFO persistence

```
fly ssh console -C 'node -e "const Redis=require(\"ioredis\"); const r=new Redis(process.env.REDIS_URL,{family:6}); r.info(\"persistence\").then(console.log).finally(()=>r.quit());"'
```

### INFO memory

```
fly ssh console -C 'node -e "const Redis=require(\"ioredis\"); const r=new Redis(process.env.REDIS_URL,{family:6}); r.info(\"memory\").then(console.log).finally(()=>r.quit());"'
```

### CONFIG GET samples

```
fly ssh console -C 'node -e "const Redis=require(\"ioredis\"); const r=new Redis(process.env.REDIS_URL,{family:6}); Promise.all([r.config(\"GET\",\"dir\"), r.config(\"GET\",\"appendonly\"), r.config(\"GET\",\"save\"), r.config(\"GET\",\"maxmemory\"), r.config(\"GET\",\"maxmemory-policy\")]).then(console.log).finally(()=>r.quit());"'
```

Це покаже, чи включені AOF/RDB і куди пишуться файли (volume), та який maxmemory/policy. Volume видно як /dev/vdb змонтований у /.fly-upper-layer; якщо dir вказує туди — Redis пише на volume.
