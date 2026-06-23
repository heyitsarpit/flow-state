# Docs Framework [Why Vocs is the docs app]

## Decision

Use Vocs as the long-term docs app.

Vocs is a React-based, Vite-powered documentation framework designed for agents and humans. That matches Flow State's goal: docs should be readable in the browser and useful as compact structured context for AI agents.

## Why Vocs

- React-based.
- Vite-powered.
- Markdown and MDX support.
- Built-in agent-facing outputs such as `llms.txt` and `llms-full.txt`.
- Twoslash support for future TypeScript-heavy guides.
- Customizable theme variables, CSS, and layout slots.
- Lightweight compared to Docusaurus.
- Better aligned with our React-first examples than VitePress.

## API Reference Plan

Vocs is the docs shell, not the API extractor.

The future API reference pipeline should be:

1. Source exports and comments from package code.
2. Generate API material with TypeDoc.
3. Generate Markdown with a TypeDoc Markdown plugin.
4. Publish generated pages inside the Vocs docs tree.
5. Keep hand-written guides beside generated reference pages.

## Alternatives

| Framework  | Fit      | Notes                                             |
| ---------- | -------- | ------------------------------------------------- |
| Vocs       | Best fit | React, Vite, MDX, Twoslash, agent-facing outputs. |
| Starlight  | Strong   | Polished documentation product, Astro-centered.   |
| VitePress  | Good     | Vite-native, but Vue-centered.                    |
| Docusaurus | Powerful | React and mature, but heavier than needed.        |

## Revisit Later

- After Project Editor stabilizes.
- Before generating real TypeDoc pages.
- Before visual polish work.
