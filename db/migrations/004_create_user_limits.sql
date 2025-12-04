-- Per-user limits (role-based)
CREATE TYPE user_role AS ENUM ('user', 'admin');

CREATE TABLE IF NOT EXISTS user_limits (
  user_id UUID PRIMARY KEY,
  role user_role NOT NULL,
  hard_rpd INTEGER NULL,
  lite_rpd INTEGER NULL,
  max_concurrency INTEGER NULL,
  unlimited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_limits_user_fk FOREIGN KEY (user_id) REFERENCES users(id)
);
