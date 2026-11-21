import { useState } from 'react';

import { createSpace, updateLearningGoal } from '../../lib/library';
import { MAX_LEARNING_GOAL, MAX_SPACE_NAME, type KnowledgeSpace } from '../../lib/library-model';
import { SaveStatus } from './SaveStatus';
import { useAction } from './useAction';

type KnowledgeSpacesProps = {
  spaces: KnowledgeSpace[];
  selected: KnowledgeSpace | undefined;
  onSelect: (id: string) => void;
};

export function KnowledgeSpaces({ spaces, selected, onSelect }: KnowledgeSpacesProps) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const create = useAction();

  return (
    <section aria-labelledby="knowledge-spaces">
      <h2 id="knowledge-spaces">Knowledge Spaces</h2>
      {selected ? (
        <>
          <label>
            Active space
            <select value={selected.id} onChange={(event) => onSelect(event.target.value)}>
              {spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
            </select>
          </label>
          <LearningGoal key={selected.id} space={selected} />
        </>
      ) : <p>Create a Knowledge Space to organize articles around a learning goal.</p>}

      <details open={!selected || undefined}>
        <summary>Create a Knowledge Space</summary>
        <form onSubmit={(event) => {
          event.preventDefault();
          void create.run(async () => {
            const id = await createSpace(name, goal);
            setName('');
            setGoal('');
            onSelect(id);
            return 'Knowledge Space created.';
          });
        }}>
          <label>
            Space name
            <input value={name} maxLength={MAX_SPACE_NAME} required
              onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Learning goal (optional)
            <textarea value={goal} maxLength={MAX_LEARNING_GOAL}
              onChange={(event) => setGoal(event.target.value)} />
          </label>
          <button disabled={create.state.status === 'pending' || !name.trim()}>Create space</button>
        </form>
      </details>
      <SaveStatus state={create.state} />
    </section>
  );
}

function LearningGoal({ space }: { space: KnowledgeSpace }) {
  const [draft, setDraft] = useState<string>();
  const save = useAction();
  const goal = draft ?? space.learningGoal;

  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      void save.run(async () => {
        await updateLearningGoal(space.id, goal);
        return 'Learning goal saved.';
      });
    }}>
      <label>
        Learning goal
        <textarea value={goal} maxLength={MAX_LEARNING_GOAL}
          onChange={(event) => setDraft(event.target.value)} />
      </label>
      <button disabled={save.state.status === 'pending' || goal.trim() === space.learningGoal}>
        Save goal
      </button>
      <SaveStatus state={save.state} />
    </form>
  );
}
