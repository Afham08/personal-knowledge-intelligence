import { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <main>
      <h1>Personal Knowledge Intelligence</h1>
      <button type="button" onClick={() => setCount((previous) => previous + 1)}>
        Click count: {count}
      </button>
    </main>
  );
}
