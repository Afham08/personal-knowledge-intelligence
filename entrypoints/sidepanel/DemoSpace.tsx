import { useState } from 'react';
export const samples = [
  {
    title: 'Keeping an ordered list',
    concept: 'List',
    body: 'A Python list keeps items in order. The first item has index zero. If tasks contains “read” and then “practice”, tasks[0] gives “read”.',
    quote: 'A Python list keeps items in order.',
    note: 'Use a list when the order of my tasks matters.',
    analysis: 'A list fits this learning goal because the position of each item is meaningful.',
    question: 'Which index selects the first task?',
    answer: 'Zero. tasks[0] selects the first item.',
    feedback:
      'A response that says “zero” identifies the starting index. Adding tasks[0] makes the explanation concrete.',
    connection: 1,
  },
  {
    title: 'Visiting each item',
    concept: 'Iteration',
    body: 'A for loop visits each item in a list in order. In “for task in tasks”, task refers to the current item during each pass. The loop can print each task without using an index.',
    quote: 'A for loop visits each item in a list in order.',
    note: 'I can process every task without counting positions.',
    analysis: 'Iteration uses the ordering described in the list resource to visit each task.',
    question: 'Why can this loop visit every task without an index?',
    answer: 'The loop binds task to each successive list item.',
    feedback:
      'Mentioning repeated work is a start. Explaining that task holds the current item identifies the mechanism.',
    connection: 0,
  },
  {
    title: 'Filtering a collection',
    concept: 'Condition',
    body: 'A loop can visit every task while an if condition chooses which tasks to keep. Appending matching tasks to a new list leaves the original list unchanged.',
    quote: 'Appending matching tasks to a new list leaves the original list unchanged.',
    note: 'Keep the input list when building a shorter result.',
    analysis:
      'A condition and a loop have different jobs: the loop visits items and the condition decides which to keep.',
    question: 'What decides whether a visited task enters the output?',
    answer: 'The if condition decides; the loop only visits the items.',
    feedback: 'A response naming the condition distinguishes selection from iteration.',
    connection: 1,
  },
];
export function DemoSpace({ remove }: { remove: () => void }) {
  const [index, select] = useState(0),
    [answer, setAnswer] = useState(''),
    [revealed, reveal] = useState(false),
    [query, search] = useState('');
  const s = samples[index]!;
  function choose(i: number) {
    select(i);
    setAnswer('');
    reveal(false);
  }
  return (
    <section className="card demo-space" data-tour="demo" tabIndex={-1} aria-label="Python fundamentals demo">
      <h2>Python fundamentals · Demo</h2>
      <p>
        Goal: explain how a list and a loop work together. These original sample resources, annotations and
        feedback are illustrative. Practice here stays separate from your library and progress.
      </p>
      <label>
        Find a sample resource
        <input type="search" value={query} onChange={(e) => search(e.target.value)} />
      </label>
      <div className="button-row">
        {samples.map(
          (r, i) =>
            (r.title + ' ' + r.body).toLowerCase().includes(query.trim().toLowerCase()) && (
              <button key={r.title} aria-pressed={index === i} onClick={() => choose(i)}>
                {r.title}
              </button>
            ),
        )}
      </div>
      {!samples.some((r) => (r.title + ' ' + r.body).toLowerCase().includes(query.trim().toLowerCase())) && (
        <p>No sample resources match.</p>
      )}
      <h3>{s.title}</h3>
      <p>{s.body}</p>
      <details>
        <summary>Sample highlight and note</summary>
        <blockquote>{s.quote}</blockquote>
        <p>{s.note}</p>
      </details>
      <details>
        <summary>Illustrative analysis and source</summary>
        <p>{s.analysis}</p>
        <blockquote>{s.quote}</blockquote>
        <p>Connected concept: {s.concept}</p>
        <button onClick={() => choose(s.connection)}>Read {samples[s.connection]!.title}</button>
      </details>
      <details>
        <summary>Try a sample revision item</summary>
        <p>{s.question}</p>
        <label>
          Your practice answer
          <textarea maxLength={1200} value={answer} onChange={(e) => setAnswer(e.target.value)} />
        </label>
        <button onClick={() => reveal(!revealed)}>
          {revealed ? 'Hide comparison' : 'Compare with sample answer'}
        </button>
        {revealed && (
          <>
            <p>
              <strong>Expected answer</strong> {s.answer}
            </p>
            <p>
              <strong>Illustrative feedback</strong> {s.feedback}
            </p>
            <p>
              Example schedule: a Partially Correct rating would bring this back in two days. This exercise
              creates no rating.
            </p>
          </>
        )}
      </details>
      <button onClick={remove}>Remove demo space</button>
    </section>
  );
}
