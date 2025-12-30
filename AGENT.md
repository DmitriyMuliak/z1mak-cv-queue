1 - Потрібно налаштувати (створити) github actions (on PR) які будуть:
1.1 - Запускати lint
1.2 - Запускати build
1.3 - Запускати test:unit

2 - Потрібно налаштувати (створити) github actions (on Megre to master) які будуть:
2.1 - Запускати lint
2.2 - Запускати build
2.3 - Запускати test
2.4 - Деплоїти на fly.io

3 - Налаштувати fly.toml та docker-compose.yml
3.1 - Перевірити налаштування fly.toml
3.2 - docker-compose.yml має використовувати змінні .env (які я через CLI маю задати у fly.io)
3.3 - api має залежати від db (remote supabase) - треба якось робити health check.
