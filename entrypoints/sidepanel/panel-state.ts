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

// Suppress repeated list entries for display without altering the validated, cached analysis.
export function summaryPoints(summary: AnalysisResult['analysis']['summary']) {
  const normalize = (text: string) => text.trim().replace(/\s+/gu, ' ').replace(/[.!?]+$/u, '');
  const seen = new Set([normalize(summary.overview)]);
  function unique(items: string[]) {
    return items.filter((item) => {
      const key = normalize(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return { ideas: unique(summary.ideas), takeaways: unique(summary.takeaways) };
}

export function recallSessionKey(questions: AnalysisResult['analysis']['recall']): string {
  return JSON.stringify(questions.map(({ question, answer, evidence }) => [question, answer, evidence]));
}
