import {
  API_URL,
  INTERNAL_KEY,
  RunBody,
  sseToArray,
  waitForJobResult,
} from '../utils/rateTestUtils';

export class IntegrationTestClient {
  private baseUrl: string;
  private internalKey: string;

  constructor(baseUrl: string = API_URL, internalKey: string = INTERNAL_KEY) {
    this.baseUrl = baseUrl;
    this.internalKey = internalKey;
  }

  private getHeaders(userId: string, role: 'user' | 'admin') {
    return {
      'Content-Type': 'application/json',
      'x-internal-api-key': this.internalKey,
      'x-test-user': userId,
      'x-test-role': 'authenticated',
      'x-test-user-role': role,
    };
  }

  async submitJob(body: RunBody) {
    const response = await fetch(`${this.baseUrl}/resume/analyze`, {
      method: 'POST',
      headers: this.getHeaders(body.userId, body.role),
      body: JSON.stringify(body),
    });

    return {
      status: response.status,
      json: (await response.json()) as any,
    };
  }

  async submitStreamJob(body: RunBody) {
    const response = await fetch(`${this.baseUrl}/resume/analyze`, {
      method: 'POST',
      headers: this.getHeaders(body.userId, body.role),
      body: JSON.stringify({ ...body, streaming: true }),
    });

    return response;
  }

  async getStream(
    jobId: string,
    userId: string,
    role: 'user' | 'admin',
    lastEventId?: string
  ) {
    const response = await fetch(`${this.baseUrl}/resume/${jobId}/result-stream`, {
      method: 'POST',
      headers: this.getHeaders(userId, role),
      body: JSON.stringify({ lastEventId }),
    });

    const events = await sseToArray(response);
    return {
      status: response.status,
      events,
    };
  }

  async getStatus(jobId: string) {
    const response = await fetch(`${this.baseUrl}/resume/${jobId}/status`, {
      method: 'GET',
      headers: {
        'x-internal-api-key': this.internalKey,
      },
    });

    return {
      status: response.status,
      json: (await response.json()) as any,
    };
  }

  /**
   * Helper to wait for a job result in Redis.
   * Note: This still needs a Redis instance, so maybe it belongs to a different helper,
   * but for integration tests it's often used right after submission.
   */
  async waitForResult(redis: any, jobId: string, timeoutMs?: number) {
    return waitForJobResult(redis, jobId, timeoutMs);
  }
}
