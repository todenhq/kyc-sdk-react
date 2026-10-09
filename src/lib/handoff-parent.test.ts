import { describe, expect, it } from 'vitest';
import {
  HandoffParentError,
  handoffRootTemplate,
  handoffScope,
  resolveHandoffParent,
} from './handoff-parent';
import type { HandoffSessionSnapshot } from '../services/api';

describe('handoffRootTemplate', () => {
  it('keeps the flow and drops who the person is', () => {
    const snapshot = {
      country: 'NG',
      idTypes: ['nin'],
      enableLiveness: true,
      selfieReview: true,
      workflowId: 'wf_1',
      userId: 'user_42',
      userData: { firstName: 'Ada' },
      metadata: { userId: 'user_42' },
    } as unknown as HandoffSessionSnapshot;
    expect(handoffRootTemplate(snapshot)).toEqual({
      country: 'NG',
      idTypes: ['nin'],
      enableLiveness: true,
      selfieReview: true,
    });
    // The mount's own snapshot is not touched.
    expect(snapshot).toHaveProperty('userId', 'user_42');
  });
});

describe('resolveHandoffParent', () => {
  it('binds the phone to a workflow attempt, whatever the answer carried', () => {
    expect(resolveHandoffParent({ sessionId: 'root_1' }, true)).toBe('root_1');
    expect(resolveHandoffParent({ sessionId: 'root_1', configSnapshot: {} as never }, true)).toBe('root_1');
  });

  it('binds the phone to a prop-configured attempt that holds its flow', () => {
    expect(resolveHandoffParent({ sessionId: ' root_2 ', configSnapshot: { country: 'NG' } as never }, false)).toBe('root_2');
  });

  // An attempt started by an older SDK holds no flow: bound to it, the phone
  // would open an empty one.
  it('leaves the phone unbound when a prop-configured attempt holds no flow', () => {
    expect(resolveHandoffParent({ sessionId: 'root_3' }, false)).toBeUndefined();
    expect(resolveHandoffParent({ sessionId: 'root_3', configSnapshot: {} as never }, false)).toBeUndefined();
    expect(resolveHandoffParent({ sessionId: 'root_3', configSnapshot: [] as never }, false)).toBeUndefined();
  });

  it('refuses when there is no attempt to bind to', () => {
    expect(() => resolveHandoffParent(null, true)).toThrow(HandoffParentError);
    expect(() => resolveHandoffParent(null, false)).toThrow(HandoffParentError);
    expect(() => resolveHandoffParent({ sessionId: '  ' }, true)).toThrow(HandoffParentError);
  });
});

describe('handoffScope', () => {
  it('changes with the key, the server, the workflow and the user', () => {
    const base = { apiKey: 'pk_test_a', devUrl: undefined, workflowId: 'wf_1', externalUserId: 'u1' };
    const scope = handoffScope(base);
    expect(handoffScope({ ...base })).toBe(scope);
    expect(handoffScope({ ...base, apiKey: 'pk_test_b' })).not.toBe(scope);
    expect(handoffScope({ ...base, devUrl: 'http://localhost:3001' })).not.toBe(scope);
    expect(handoffScope({ ...base, workflowId: 'wf_2' })).not.toBe(scope);
    expect(handoffScope({ ...base, externalUserId: 'u2' })).not.toBe(scope);
  });
});
