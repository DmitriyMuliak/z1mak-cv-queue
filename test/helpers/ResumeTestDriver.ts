import { FastifyInstance } from 'fastify';
import { parseSSE } from './sse-parser';

export class ResumeTestDriver {
  constructor(private fastify: FastifyInstance) {}

  private get defaultHeaders() {
    return {
      'x-test-user': 'u1',
      'x-test-role': 'authenticated',
      'x-test-user-role': 'user',
    };
  }

  /**
   * Submits a resume for analysis.
   */
  async submitResume(payload: any, streaming = false) {
    const response = await this.fastify.inject({
      method: 'POST',
      url: '/resume/analyze',
      headers: this.defaultHeaders,
      payload: { ...payload, streaming },
    });

    return {
      status: response.statusCode,
      body: JSON.parse(response.body),
    };
  }

  /**
   * Connects to the streaming endpoint and returns parsed SSE events.
   */
  async getStream(jobId: string, lastEventId: string = '') {
    const response = await this.fastify.inject({
      method: 'POST',
      url: `/resume/${jobId}/result-stream`,
      headers: this.defaultHeaders,
      payload: { lastEventId },
    });

    return {
      status: response.statusCode,
      headers: response.headers,
      events: parseSSE(response.body),
    };
  }

  /**
   * Fetches the static result of a job.
   */
  async getResult(jobId: string) {
    const response = await this.fastify.inject({
      method: 'GET',
      headers: this.defaultHeaders,
      url: `/resume/${jobId}/result`,
    });

    return {
      status: response.statusCode,
      body: JSON.parse(response.body),
    };
  }

  /**
   * Fetches the status of a job.
   */
  async getStatus(jobId: string) {
    const response = await this.fastify.inject({
      method: 'GET',
      headers: this.defaultHeaders,
      url: `/resume/${jobId}/status`,
    });

    return {
      status: response.statusCode,
      body: JSON.parse(response.body),
    };
  }
}
