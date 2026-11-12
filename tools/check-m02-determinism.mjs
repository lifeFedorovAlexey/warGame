// Compatibility entry point. Campaigns now share the asynchronous frame-budget
// scheduler; exact wall-budget-independent search publication required the old
// unbounded per-mission planner. Validate the common engine contract instead.
import './check-campaign-planning.mjs';
