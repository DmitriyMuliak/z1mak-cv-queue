import { createClient } from '@supabase/supabase-js';
import { env } from '../src/config/env';

type AdminUser = {
  id: string;
  email?: string | null;
};

const USAGE =
  'Usage: npm run admin:create -- --email "user@example.com" --password "secret"';

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
const password = getArgValue(['--password', '-p']);

if (hasFlag(['--help', '-h'])) {
  console.log(USAGE);
  process.exit(0);
}

if (!email || !password) {
  console.error('Missing --email or --password');
  console.error(USAGE);
  process.exit(1);
}

const supabaseUrl = env.supabaseUrl;
const serviceRoleKey = env.supabasePrivateKey;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const main = async () => {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'admin' },
  });

  if (error) {
    throw error;
  }

  const user = data?.user as AdminUser | undefined;
  if (!user?.id) {
    throw new Error('Admin user creation returned no user');
  }

  console.log(`✅ Admin user created: ${user.id}`);
};

main().catch((error) => {
  console.error('Failed to create admin user:', error);
  process.exit(1);
});
