import { useState } from 'react';

import { createSpace, updateLearningGoal } from '../../lib/library';
import { MAX_LEARNING_GOAL, MAX_SPACE_NAME, type KnowledgeSpace, type SpaceArticle } from '../../lib/library-model';
import { Icon } from './Icon';
import { SaveStatus } from './SaveStatus';
import { useDraft } from './useDraft';
import { useAction } from './useAction';

type KnowledgeSpacesProps = {
  spaces: KnowledgeSpace[];
  selected: KnowledgeSpace | undefined;
  links: SpaceArticle[];
  onSelect: (id: string) => void;
  onViewArticles: (id: string) => void;
};

export function KnowledgeSpaces({ spaces, selected, links, onSelect, onViewArticles }: KnowledgeSpacesProps) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [creating, setCreating] = useState(false);
  const create = useAction();
  const counts = new Map<string, number>();
  for (const link of links) counts.set(link.spaceId, (counts.get(link.spaceId) ?? 0) + 1);

  return (
    <>
      <section className="card" aria-labelledby="create-space-heading">
        <div className="section-heading">
          <h2 id="create-space-heading">New Knowledge Space</h2>
          {spaces.length > 0 && (
            <button className={creating ? '' : 'button-primary'} type="button" aria-expanded={creating}
              aria-controls={creating ? 'space-creation' : undefined} onClick={() => setCreating(!creating)}>
              {creating ? 'Hide form' : 'New space'}
            </button>
          )}
        </div>
        {(creating || spaces.length === 0) && (
          <form id="space-creation" onSubmit={(event) => {
            event.preventDefault();
            void create.run(async () => {
              const id = await createSpace(name, goal);
              setName('');
              setGoal('');
              setCreating(false);
              onSelect(id);
              return 'Knowledge Space created.';
            });
          }}>
            {spaces.length === 0 && <p className="empty-copy">Create your first space to save an article and set a goal for analysis.</p>}
            <label>Space name
              <input disabled={create.state.status === 'pending'} value={name} maxLength={MAX_SPACE_NAME} required placeholder="e.g. Climate science"
                onChange={(event) => setName(event.target.value)} />
            </label>
            <label>Learning goal <span className="field-hint">Optional</span>
              <textarea disabled={create.state.status === 'pending'} value={goal} maxLength={MAX_LEARNING_GOAL} placeholder="What do you want to understand?"
                onChange={(event) => setGoal(event.target.value)} />
            </label>
            <button className="button-primary" disabled={create.state.status === 'pending' || !name.trim()}>Create space</button>
          </form>
        )}
        <SaveStatus state={create.state} />
      </section>

      {spaces.map((space) => {
        const active = selected?.id === space.id;
        const count = counts.get(space.id) ?? 0;
        return (
          <section className={active ? 'card space-card space-active' : 'card space-card'} key={space.id}>
            <div className="card-heading"><span className="row-icon"><Icon name="spaces" /></span>
              <div><h2>{space.name}</h2><p className="metadata">{count} {count === 1 ? 'article' : 'articles'}</p></div></div>
            {active ? (
              <>
                <p className="active-space-label">Selected space</p>
                <LearningGoal key={space.id} space={space} />
              </>
            ) : <p className="space-goal">{space.learningGoal || 'No learning goal set.'}</p>}
            <div className="button-row">
              {!active && <button type="button" onClick={() => onSelect(space.id)}>Select space</button>}
              <button className="text-button" type="button" onClick={() => onViewArticles(space.id)}>
                View articles <Icon name="arrow" />
              </button>
            </div>
          </section>
        );
      })}
    </>
  );
}

function LearningGoal({ space }: { space: KnowledgeSpace }) {
  const draft = useDraft('goal', space.id);
  const save = useAction();
  const goal = draft.value ?? space.learningGoal;

  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      void save.run(async () => {
        await updateLearningGoal(space.id, goal);
        draft.saved(goal);
        return 'Learning goal saved.';
      });
    }}>
      <label>Learning goal
        <textarea value={goal} maxLength={MAX_LEARNING_GOAL} placeholder="What do you want to learn?"
          onChange={(event) => draft.edit(event.target.value)} />
      </label>
      <button disabled={save.state.status === 'pending' || goal.trim() === space.learningGoal}>Save goal</button>
      <SaveStatus state={save.state} />
    </form>
  );
}
