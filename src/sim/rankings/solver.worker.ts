// Worker entry for the /rankings page: Riley's solver.ts registers its `onmessage` handler when it
// finds itself in a worker scope (no `document`, a `self`), so importing it is the whole job.
import "@skittle/solver";
