1 - Create new Project for DB.
2 - Setup local db connect for testing proposes.
3 - Connect to new DB.
4 - Update DB Schema.
5 - Revise ENV variables and clean it in docker-compose file.
6 - Add mechanism for keep old precessed resume for some time.
7 - Revise update user limits logic. (add endpoint)
8 - Get from redis if not exist get from DB and put to the cache.
9 - Update limits and models (actualize data from google).
10 - Create fly.io config
11 - Revise auto restart for processes with fly.io and without.
12 - Create pipeline for github.
13 - Merge on master.
14 - Buy VPS.

// Front-end

1 - Remove logic related to call AI.
2 - Call Resume service.
3 - Small Refactor.
4 - Add Base unit test.
5 - Add Playwright test for main(full) flow.
6 - Add github pipeline.
7 - Change main bg colors.
8 - Revise texts.
9 - Add history widget with links (by UserID -> JobID) -> click -> Show resume analyze.
