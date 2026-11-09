import { z } from 'zod'

// Turns off zod's "JIT" speed trick (M4 plan D22).
//
// To check objects faster, zod normally tries to build a small function from text with
// `new Function(...)`, which is a form of `eval`. Our Content Security Policy forbids eval
// (script-src 'self', nginx/security-headers.conf). zod copes with the refusal, but the browser
// still reports it as a CSP violation on every page load. `jitless` makes zod skip the attempt.
// Parsing is very slightly slower, which doesn't matter at our data sizes.
//
// ORDER MATTERS: zod reads this setting when each schema is *created*, which happens as soon as a
// schema file is loaded. So main.tsx imports this file first, before anything that defines a schema.
z.config({ jitless: true })
