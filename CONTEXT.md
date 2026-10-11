# cli-dashboard

A personal Claude Code display that shows session health and live activity at a glance.

## Language

**Dumb Meter**:
How full the context is, measured against the Soft Limit and named with one of five Dumb States.
_Avoid_: context bar, fill %

**Soft Limit**:
The token count the Dumb Meter treats as "full": 800k, or the session's context window when that is smaller.
_Avoid_: window size, max context

**Dumb State**:
One of the five names for Dumb Meter fill, in order: Smart, Coasting, Foggy, Cooked, Dumb.
_Avoid_: level, zone

**Session Tokens**:
One total of tokens used by the session (input, cache-read and output added together).
_Avoid_: usage, billed tokens

**Cache Countdown**:
The time left before the prompt cache expires.
_Avoid_: TTL

**Panel**:
The bordered block drawn under the prompt that holds every Cell.
_Avoid_: statusline, band, bar

**Cell**:
One bordered compartment of the Panel that shows a single value.
_Avoid_: segment, box, field

**Fixed Rows**:
The two Panel rows that are always shown: where/who (directory, branch, model, rate limits) and how full (Dumb Meter, Session Tokens, Cache Countdown).
_Avoid_: header, static band

**Activity Section**:
A Panel section that appears only while it has something to show: agents, workflows, tasks, or the skills/plugins list.
_Avoid_: dynamic row, extra row

**Agent Row**:
One line in the agents Activity Section for one subagent, kept until the next prompt.
_Avoid_: subagent entry, tree node

**Session Name**:
The name other sessions use to message this session, such as `creating-own-yas-18`.
_Avoid_: peer name, session id, session title

## Relationships

- The **Panel** has two **Fixed Rows** and zero or more **Activity Sections**, all made of **Cells**.
- The **Dumb Meter** shows one **Dumb State**, derived from context tokens divided by the **Soft Limit**.

## Flagged ambiguities

- "Session name" was first used for the human session title. Resolved: Session Name is only the messaging name; the title is not shown.
- "Context %" was used both for fill against the real window and for fill against the Soft Limit. Resolved: only the Soft Limit fill (the Dumb Meter) is shown.
