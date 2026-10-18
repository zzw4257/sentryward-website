# Article scope

This is one evolving research article in `zzw4257/sentryward-website`, starting with
Section 1.1 of the general problem formulation. The chapter does not begin with a
library-specific failure, and it does not introduce a search algorithm or reward.

The page reuses the website's article typography, navigation, math renderer, and
paper-style figure vocabulary. New CSS and code are confined to this article.
The existing technical article, home page, deployment workflow, and CNAME are unchanged.

The finite illustration assumes exact topological execution semantics, one atomic
write/read per tile, two slots, immediate visibility, and serialized computations.
Its whole-slot ordering contract is sufficient and can be stronger than necessary.
The reachability verdict applies only to those declared duties and assumptions.
Tests independently enumerate reachable completed-event sets and validate each
displayed witness against the candidate dependencies. No PTX or GPU run is implied.

Preview from the repository root with `python3 -m http.server 8774 --bind 127.0.0.1`.
Run the repository checks documented in the root README. Browser checks should cover
both input sizes, all three edits, a successful execution of a rejected candidate,
the violating execution, range-keyboard controls, reduced motion, and 320px layout.

The personal reader copy is hosted at https://sentryward.z2w.tech/ through the
dedicated `sentryward-research` Vercel project. It contains only this article and
the required static assets, with the upstream license retained. The domain root
opens the article; the technical-blog link goes to the original SentryWard blog.
Publishing is manual and separate from GitHub Pages and the older showcase projects.

Keep this branch and PR for fork review. Do not merge into a publishing branch,
run the Pages workflow, or open an upstream PR as part of preparing this draft.
