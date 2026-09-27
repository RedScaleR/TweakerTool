import { createMockApi } from './mock.js';

const bridge = window.tweaker;

/** Real backend inside the Windows app, simulated one everywhere else. */
export const api = bridge && !bridge.demo ? bridge : createMockApi(bridge);
export const isDemo = api.demo === true;
export const inElectron = Boolean(bridge);
