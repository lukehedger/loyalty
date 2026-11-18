---
description: Open a pull request with auto-merge enabled, then address review comments and failed checks until it is clean
---

open pr with auto-merge enabled

then watch the pull request and repeat this round:

1. wait until the checks have finished
2. read the unresolved review threads and failed checks. if no thread is waiting on a reply and every check passes, stop
3. address each waiting thread: fix it, or reply with evidence for why no change is needed. never resolve a thread - leave that to its author
4. run `bun verify`, commit and push

stop if the pull request merges or closes. if a finding needs a product decision or keeps coming back after you addressed it, stop and ask me
