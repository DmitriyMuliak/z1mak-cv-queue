const endsWithSafe = (key: string, suffix: string | undefined) =>
  suffix ? key.endsWith(suffix) : true;

export class FakeRedis {
  strings = new Map<string, string>();
  hashes = new Map<string, Record<string, string>>();
  zsets = new Map<string, Map<string, number>>();
  expirations = new Map<string, number>();

  scanCalls: Array<{ pattern: string; count: number }> = [];
  delCalls: string[][] = [];

  reset() {
    this.strings.clear();
    this.hashes.clear();
    this.zsets.clear();
    this.expirations.clear();
    this.scanCalls = [];
    this.delCalls = [];
  }

  set(key: string, value: string | number, mode?: string, ttlMs?: number, nx?: string) {
    // Support basic NX locking semantics used in cron
    if (nx === 'NX' && this.strings.has(key)) {
      return null;
    }
    this.strings.set(key, String(value));
    if (mode === 'PX' && typeof ttlMs === 'number') {
      this.expirations.set(key, Math.ceil(ttlMs / 1000));
    }
    return 'OK';
  }

  get(key: string) {
    return this.strings.get(key) ?? null;
  }

  hset(key: string, values: Record<string, string | number | null | undefined>) {
    const existing = this.hashes.get(key) ?? {};
    for (const [k, v] of Object.entries(values)) {
      existing[k] = v === undefined || v === null ? '' : String(v);
    }
    this.hashes.set(key, existing);
  }

  hgetall(key: string) {
    return this.hashes.get(key) ?? {};
  }

  del(...keys: string[]) {
    this.delCalls.push(keys);
    for (const key of keys) {
      this.strings.delete(key);
      this.hashes.delete(key);
      this.zsets.delete(key);
    }
  }

  exists(key: string) {
    return this.strings.has(key) || this.hashes.has(key) || this.zsets.has(key) ? 1 : 0;
  }

  scan(
    cursor: string,
    _match: string,
    pattern: string,
    _countKey: string,
    count: number
  ) {
    this.scanCalls.push({ pattern, count });
    const keys = Array.from(
      new Set([...this.strings.keys(), ...this.hashes.keys(), ...this.zsets.keys()])
    ).filter((k) => this.matchesPattern(k, pattern));
    const slice = keys.slice(Number(cursor), Number(cursor) + count);
    const next =
      Number(cursor) + count >= keys.length ? '0' : String(Number(cursor) + count);
    return [next, slice];
  }

  private matchesPattern(key: string, pattern: string) {
    if (pattern === '*') return true;
    const [prefix, suffix] = pattern.split('*');
    return key.startsWith(prefix) && endsWithSafe(key, suffix);
  }

  zrange(key: string, start: number, end: number) {
    const map = this.zsets.get(key);
    if (!map) return [];
    const sorted = Array.from(map.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([member]) => member);

    const len = sorted.length;
    const normalize = (idx: number) => {
      if (idx < 0) return Math.max(len + idx, 0);
      return Math.min(idx, len - 1);
    };

    if (len === 0) return [];
    const s = normalize(start);
    const e = normalize(end);
    if (s > e) return [];
    return sorted.slice(s, e + 1);
  }

  zrem(key: string, member: string) {
    const map = this.zsets.get(key);
    if (!map) return 0;
    const had = map.delete(member);
    return had ? 1 : 0;
  }

  zremrangebyscore(key: string, min: string | number, max: string | number) {
    const map = this.zsets.get(key);
    if (!map) return 0;
    let removed = 0;
    const toNum = (v: string | number) => {
      if (v === '-inf') return -Infinity;
      if (v === '+inf' || v === 'inf') return Infinity;
      const n = Number(v);
      return Number.isNaN(n) ? 0 : n;
    };
    const minNum = toNum(min);
    const maxNum = toNum(max);
    for (const [member, score] of Array.from(map.entries())) {
      if (score >= minNum && score <= maxNum) {
        map.delete(member);
        removed++;
      }
    }
    return removed;
  }

  zadd(key: string, score: number, member: string) {
    const map = this.zsets.get(key) ?? new Map<string, number>();
    map.set(member, score);
    this.zsets.set(key, map);
  }

  ttl(key: string) {
    const ttl = this.expirations.get(key);
    return ttl === undefined ? -1 : ttl;
  }

  expire(key: string, seconds: number) {
    this.expirations.set(key, seconds);
    return 1;
  }

  pipeline() {
    const commands: Array<() => void> = [];
    const pipe = {
      hset: (key: string, values: Record<string, string | number | null | undefined>) => {
        commands.push(() => this.hset(key, values));
        return pipe;
      },
      zrem: (key: string, member: string) => {
        commands.push(() => this.zrem(key, member));
        return pipe;
      },
      del: (...keys: string[]) => {
        commands.push(() => this.del(...keys));
        return pipe;
      },
      zremrangebyscore: (key: string, min: string | number, max: string | number) => {
        commands.push(() => this.zremrangebyscore(key, min, max));
        return pipe;
      },
      exec: async () => {
        commands.forEach((fn) => fn());
        return [];
      },
    };
    return pipe;
  }

  returnTokensAtomic(
    keys: [string, string, string],
    args: [number, number, number, number]
  ): [number | null, number | null, number | null] {
    const [rpmKey, rpdKey, userKey] = keys;
    const [consume, minuteTtl, dayTtl, userDayTtl] = args.map((n) => Number(n));

    const decrAndClamp = (key: string, ttl: number) => {
      if (!key || key === '__nil__') return null;
      const current = Number(this.get(key) ?? '0');
      const next = Math.max(0, current - consume);
      this.set(key, next);
      if (ttl > 0) this.expire(key, ttl);
      return next;
    };

    return [
      decrAndClamp(rpmKey, minuteTtl),
      decrAndClamp(rpdKey, dayTtl),
      decrAndClamp(userKey, userDayTtl),
    ];
  }

  expireStaleJob(
    keys: [string, string, string, string, string],
    args: [number, string, string, string, string, string, string]
  ) {
    const [waitingKey, activeKey, rpdKey, resultKey, metaKey] = keys;
    const [dayTtl, finishedAt, updatedAt, status, error, errorCode, jobId] = args;

    const decrAndClamp = (key: string) => {
      if (!key || key === '__nil__') return;
      const current = Number(this.get(key) ?? '0');
      const next = Math.max(0, current - 1);
      this.set(key, next);
    };

    if (waitingKey && waitingKey !== '__nil__') {
      decrAndClamp(waitingKey);
    }
    if (activeKey && activeKey !== '__nil__' && jobId) {
      const set = this.zsets.get(activeKey);
      if (set) set.delete(jobId);
    }
    if (rpdKey && rpdKey !== '__nil__') {
      decrAndClamp(rpdKey);
      if (dayTtl > 0) this.expire(rpdKey, Number(dayTtl));
    }

    this.hset(resultKey, {
      status,
      error,
      error_code: errorCode,
      finished_at: finishedAt,
      expired_at: finishedAt,
    });
    this.hset(metaKey, {
      status,
      updated_at: updatedAt,
    });

    return 1;
  }
}
