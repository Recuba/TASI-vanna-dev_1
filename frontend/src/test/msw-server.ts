/**
 * MSW server instance for Node/jsdom tests (vitest).
 */
import { setupServer } from 'msw/node';
import { handlers } from './msw-handlers';

export const server = setupServer(...handlers);
