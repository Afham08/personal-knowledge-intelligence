import type { Destination } from './navigation';

type IconName = Destination | 'book' | 'arrow' | 'back' | 'page' | 'external' | 'shield';

const paths: Record<IconName, string> = {
  home: 'M3 10.5 12 3l9 7.5v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z',
  spaces: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  library: 'M4 5h12v15H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 11h12m3-11h2v15h-2',
  settings: 'M5 4v16m7-16v16m7-16v16M3 8h4m3 8h4m3-6h4',
  book: 'M12 7C9 4 5 4 3 5v13c3-1 6-1 9 2 3-3 6-3 9-2V5c-2-1-6-1-9 2Zm0 0v13',
  arrow: 'M5 12h13m-5-5 5 5-5 5',
  back: 'M19 12H6m5-5-5 5 5 5',
  page: 'M6 3h8l4 4v14H6Zm8 0v5h4M9 12h6m-6 4h6',
  external: 'M13 5h6v6m0-6-8 8m5 0v5H6V8h5',
  shield: 'M12 3 5 6v5c0 4 3 7 7 10 4-3 7-6 7-10V6Zm-3 9 2 2 4-4',
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
