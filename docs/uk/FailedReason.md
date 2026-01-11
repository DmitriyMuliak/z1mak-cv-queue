Лімітні падіння дають failedReason 'MODEL_RPD_EXCEEDED' або 'USER_RPD_EXCEEDED' (кидаємо UnrecoverableError після чеків Lua) — consumeLimitsIfNeeded.ts (lines 44-49).

Якщо для моделі не знайшли api_name в Redis, кидаємо UnrecoverableError з текстом MODEL_API_NAME_MISSING:<model> — executeModel.ts (lines 13-16).

Коли провайдер повертає не-ретраїбл помилку, ми загортаємо її в UnrecoverableError з її текстом або provider_fatal_error (якщо message пустий) — finalizeFailure.ts (lines 3-8).

Для Gemini це можуть бути повідомлення на кшталт Gemini rate limit exceeded, Gemini invalid request, Gemini request failed precondition, Gemini permission denied, Gemini resource not found, Gemini context too long тощо (errorMapping.ts (lines 5-97)).

Інші провайдерські/системні помилки (ретраїбл) після останньої спроби також підуть у failedReason зі своїм .message.
Якщо BullMQ не заповнив failedReason, ми зберігаємо provider_error як дефолт — queueEvents.ts (line 68).
