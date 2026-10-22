# Every worker reviewed before it lands

Nothing merges until a reviewer in a fork of the worker's checkout has read it against the goal.

Jonas stopped reading every diff himself. Each worker's brief ends the same way: when you're done, get yourself
reviewed, answer every note, then tell me. The worker runs `tower review` on itself, a reviewer starts in a fork of
its checkout, and the notes land on the checkout's review thread.

By the time a worker says it's ready, the obvious problems are fixed and the thread says why the rest stayed.
Jonas reads the thread and the Changes tab, adds a note of his own if something is off, and lands it.
