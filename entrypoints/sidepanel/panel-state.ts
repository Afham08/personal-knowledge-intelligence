import type { ActiveTab } from '../../lib/active-tab';
import type { analyzeArticle } from '../../lib/ai/analysis';

export type AnalysisResult = Awaited<ReturnType<typeof analyzeArticle>>;
type AnalysisStatus =
  | { status: 'idle' | 'running' | 'retrying' | 'cancelled' }
  | { status: 'error'; message: string }
  | { status: 'ready'; result: AnalysisResult };

export type AnalysisState = AnalysisStatus & { result?: AnalysisResult };

export function updateAnalysis(state: AnalysisState, action: AnalysisStatus): AnalysisState {
  return action.status === 'ready' ? action : { ...action, result: state.result };
}

export type TabState =
  | { status: 'loading' | 'error' }
  | { status: 'ready'; tab: ActiveTab | null; documentVersion: number };

export function tabSnapshot(state: TabState, tab: ActiveTab | null): TabState {
  const sameTab = state.status === 'ready' && state.tab?.id === tab?.id;
  return { status: 'ready', tab, documentVersion: sameTab ? state.documentVersion : 0 };
}

export function markTabLoading(state: TabState, tabId: number): TabState {
  if (state.status !== 'ready' || state.tab?.id !== tabId) return state;
  return { ...state, tab: { ...state.tab, loading: true }, documentVersion: state.documentVersion + 1 };
}

export function releaseSavedDraft(current: string | undefined, submitted: string): string | undefined {
  return current === submitted ? undefined : current;
}

export function recallSessionKey(questions: AnalysisResult['analysis']['recall']): string {
  return JSON.stringify(questions.map(({ question, answer, evidence }) => [question, answer, evidence]));
}
