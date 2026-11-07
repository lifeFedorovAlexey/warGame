// The opening now uses the event-driven v2 script rather than a fixed 52-line queue.
import './check-story-v2.mjs';
await import('./check-story-v2-browser.mjs');
