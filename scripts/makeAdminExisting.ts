import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

type AdminUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

const USAGE = 'Usage: npm run admin:make -- --email "user@example.com"';

const args = process.argv.slice(2);
const hasFlag = (names: string[]): boolean => names.some((name) => args.includes(name));
const getArgValue = (names: string[]): string | undefined => {
  for (const name of names) {
    const index = args.indexOf(name);
    if (index !== -1 && args[index + 1]) return args[index + 1];
  }
  return undefined;
};

const email = getArgValue(['--email', '-e']);
if (hasFlag(['--help', '-h'])) {
  console.log(USAGE);
  process.exit(0);
}

if (!email) {
  console.error('Missing --email');
  console.error(USAGE);
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const findUserByEmailViaDb = async (
  targetEmail: string
): Promise<AdminUser | null> => {
  if (!dbUrl) return null;

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const { rows } = await client.query<AdminUser>(
      `SELECT id, email, raw_user_meta_data AS user_metadata
         FROM auth.users
        WHERE lower(email) = lower($1)
        LIMIT 1`,
      [targetEmail]
    );

    return rows[0] ?? null;
  } finally {
    await client.end();
  }
};

const findUserByEmailViaApi = async (
  targetEmail: string
): Promise<AdminUser | null> => {
  const normalized = targetEmail.trim().toLowerCase();
  const perPage = 1000;
  const maxPages = 50;

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = (data?.users ?? []) as AdminUser[];
    const match = users.find(
      (user) => (user.email ?? '').toLowerCase() === normalized
    );

    if (match) return match;
    if (users.length < perPage) return null;
  }

  return null;
};

const main = async () => {
  const user = (await findUserByEmailViaDb(email)) ?? (await findUserByEmailViaApi(email));

  if (!user) {
    console.error(`User not found for email: ${email}`);
    process.exit(1);
  }

  const currentMetadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: { ...currentMetadata, role: 'admin' },
  });

  if (updateError) throw updateError;

  const { error: seedError } = await supabase.rpc('seed_user_limits', {
    _user_id: user.id,
    _role: 'admin',
  });

  if (seedError) throw seedError;

  console.log(`✅ User promoted to admin and limits seeded: ${user.id}`);
};

main().catch((error) => {
  console.error('Failed to promote user:', error);
  process.exit(1);
});
