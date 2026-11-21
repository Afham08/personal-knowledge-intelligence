import { useState } from 'react';

type ActionState =
  | { status: 'idle' | 'pending' }
  | { status: 'success' | 'error'; message: string };

export function useAction() {
  const [state, setState] = useState<ActionState>({ status: 'idle' });

  async function run(action: () => Promise<string>) {
    setState({ status: 'pending' });
    try {
      setState({ status: 'success', message: await action() });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Try again.';
      setState({ status: 'error', message: 'Could not save. ' + message });
    }
  }

  return { state, run };
}
