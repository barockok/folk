# Vendored translator from 9router

Translation logic in `translator.ts` is a TypeScript port of selected files
from the 9router project (`open-sse/translator/request/claude-to-openai.js`,
`open-sse/translator/response/openai-to-claude.js`,
`open-sse/translator/helpers/maxTokensHelper.js`).

Source: https://github.com/decolua/9router (MIT, Copyright (c) 2024-2026
decolua and contributors).

The original 9router code is reproduced and adapted under the MIT license. The
port:
- Drops the registry / multi-format dispatch (folk only needs Claude↔OpenAI
  for OpenCode's `/zen/v1/chat/completions` route).
- Replaces JS imports with self-contained TypeScript.
- Strips RTK / cloak / tool-name-prefix branches that don't apply to OpenCode.

If you upgrade or modify this code, keep this notice intact.
