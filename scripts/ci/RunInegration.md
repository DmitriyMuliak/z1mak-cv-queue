## CI bash script explanation

Покроково, що робить скрипт run-integration-tests.sh

1. #!/usr/bin/env bash
   Вказує, що це bash-скрипт.

2. set -euo pipefail

Режим “падай одразу”, якщо:

- будь-яка команда повернула помилку (-e),
- використано неоголошену змінну (-u),
- у пайпі впала будь-яка команда (pipefail).

3. Блок змінних (LOG_DIR, HEALTH_RETRIES, PORT_VALUE, HEALTH_URL, INTERNAL_KEY)

- Читає env або бере дефолт.
- Синтаксис ${VAR:-default} = “візьми VAR, якщо нема — default”.
- run-integration-tests.sh

4. Формує шляхи до логів mock/api/worker.
   run-integration-tests.sh

5. Ініціалізує PID-змінні порожніми (MOCK_PID, API_PID, WORKER_PID).
   run-integration-tests.sh

6. Оголошує cleanup():

- бере код завершення,
- якщо був фейл — друкує логи процесів,
- завершує фонові процеси по PID.
  run-integration-tests.sh

7. trap cleanup EXIT
   Гарантує запуск cleanup при будь-якому виході зі скрипта (успіх/помилка).
   run-integration-tests.sh

8. Стартує 3 фонові процеси:

- mock-gemini
- api
- worker
  Логи кожного пише у свій файл, PID бере через $!.
  run-integration-tests.sh

9. Health-check цикл:

- до HEALTH_RETRIES разів пробує curl /health з internal key,
- між спробами спить HEALTH_SLEEP_SECONDS.
  run-integration-tests.sh

10. Після циклу робить ще один обов’язковий curl:

- якщо API так і не піднявся — скрипт падає (завдяки set -e).
  run-integration-tests.sh

11. Запускає інтеграційні тести npm run test:integration.
    run-integration-tests.sh

```
 if [ -n "${WORKER_PID}" ]; then kill "${WORKER_PID}" >/dev/null 2>&1 || true; fi
```

Це шаблон “тихо і без фейлу” для команди в bash.

На прикладі:
kill "${WORKER_PID}" >/dev/null 2>&1 || true; fi

- /dev/null — прибирає стандартний вивід (stdout).
- 2>&1 — перенаправляє stderr туди ж, куди stdout (тобто теж у /dev/null).
- || true — якщо команда впала (наприклад процес уже мертвий), весь вираз все одно вважається успішним.
- ; fi — закриття if-блоку.

Навіщо тут: у cleanup це дозволяє спокійно пробувати kill, навіть якщо процес вже завершився, і не валити скрипт через set -e.
