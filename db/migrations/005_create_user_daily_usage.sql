-- Analytics-only daily usage (not used at runtime)
CREATE TABLE IF NOT EXISTS user_daily_usage (
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  used_rpd INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date),
  CONSTRAINT user_daily_usage_user_fk FOREIGN KEY (user_id) REFERENCES users(id)
);
