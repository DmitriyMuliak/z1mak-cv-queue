/// <reference lib="dom" />
/* eslint-disable @typescript-eslint/no-unused-vars */

import type { PoolClient } from 'pg';

// Curl example
// curl -v "http://127.0.0.1:4000/resume/77a12345-1111-3333-2222-4475883706ab/result" \
//   -H 'accept: application/json' \
//   -H 'Authorization: Bearer {access_token_string}'

const _getSupabaseJWT = (async () => {
  // 1. Отримуємо чисті значення кукі без назв ключів
  const cookieParts = document.cookie
    .split('; ')
    .filter((row) => row.includes('sb-evyllttuifftofzucyed-auth-token'))
    .sort() // Важливо: сортуємо .0, .1, щоб вони йшли по черзі
    .map((row) => row.split('=')[1]);

  // 2. З'єднуємо частини та видаляємо префікс
  const fullRaw = cookieParts.join('').replace(/^base64-/, '');

  // 3. Функція для безпечного декодування Base64 (з урахуванням UTF-8 та нерівних довжин)
  // @ts-expect-error only for testing propose
  const safeAtob = (str) => {
    try {
      // Додаємо необхідний padding (=), якщо рядок не кратний 4
      const pad = str.length % 4;
      if (pad) str += '='.repeat(4 - pad);
      return decodeURIComponent(
        atob(str.replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
    } catch (e) {
      return atob(str); // fall back
    }
  };

  const session = JSON.parse(safeAtob(fullRaw));
  console.log('Сесія розкодована:', session);

  // 4. Декодуємо сам JWT (access_token)
  const jwtBody = session.access_token.split('.')[1];
  console.log('Дані користувача (JWT Payload):', JSON.parse(safeAtob(jwtBody)));

  console.log('access_token_string', session.access_token);
})();

const _debugUserAuthInQuery = (client: PoolClient, jobId: string) => {
  return client.query(
    `SELECT 
       auth.uid() as debug_uid, 
       current_setting('request.jwt.claims', true) as debug_claims,
       status, result 
     FROM cv_analyzes 
     WHERE id = $1`,
    [jobId]
  );
};
