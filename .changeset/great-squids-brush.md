---
"@vite-deploy/netlify": minor
---

Improves support for `Netlify.context`

Within request scope, `Netlify.context` is now set. When not on Netlify nor used through the [Netlify CLI](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/), context properties are emulated.
