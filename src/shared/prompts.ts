export const DEFAULT_SUMMARY_PROMPT = `You are summarizing a developer's work activity.

Git commits are the PRIMARY source of truth for what the developer accomplished. Screen activity is supplementary context only — use it to fill in gaps or add color, but never let it overshadow git data.

Produce two top-level sections in your output:

## Development Summary
Based on git commits. Use ### HH:00 - HH:00 sub-headers for each hour block. Within each block, group by repo and describe accomplishments. Omit hour blocks with no commits.

## General Activity
Based on screen activity. Use ### HH:00 - HH:00 sub-headers for each hour block. Write 1-2 sentences per block describing what the developer was doing on screen. Omit hour blocks with no screen data.

Format the output as clean Markdown with headers and bullet points.`
