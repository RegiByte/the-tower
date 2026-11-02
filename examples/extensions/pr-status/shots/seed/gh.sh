#!/bin/sh
# A stand-in for `gh` in the sandbox, which has no GitHub. `gh repo view` names a made-up repo; `gh api graphql`
# answers each branch alias (`-f b<i>=<branch>`) with one made-up pull request, as GitHub shapes it, by the branch's
# name: none (no pull request), merged, closed, draft, failing (open, its checks failing, a review required), else open
# and approved. Its head commit is one no checkout has and it was opened just now, so git takes it for the branch's.
if [ "$1" = repo ]; then
  printf '{"nameWithOwner":"example/lab","url":"https://github.com/example/lab"}\n'
  exit 0
fi
out='{"data":{'
sep=''
for arg in "$@"; do
  case $arg in
    b[0-9]*=*) alias=${arg%%=*} branch=${arg#*=} ;;
    *) continue ;;
  esac
  review='"APPROVED"' checks='"SUCCESS"' draft=false
  case $branch in
    *none*) out="$out$sep\"$alias\":{\"pullRequests\":{\"nodes\":[]}}" sep=','; continue ;;
  esac
  case $branch in
    *merged*) state=MERGED ;;
    *closed*) state=CLOSED review=null ;;
    *draft*) state=OPEN draft=true review='"REVIEW_REQUIRED"' checks='"PENDING"' ;;
    *failing*) state=OPEN review='"REVIEW_REQUIRED"' checks='"FAILURE"' ;;
    *) state=OPEN ;;
  esac
  node='{"number":42,"state":"'$state'","isDraft":'$draft',"url":"https://github.com/example/lab/pull/42","title":"Faster search over the archive","reviewDecision":'$review',"headRefOid":"0000000000000000000000000000000000000042","createdAt":"'$(date -u +%FT%TZ)'","commits":{"nodes":[{"commit":{"statusCheckRollup":{"state":'$checks'}}}]}}'
  out="$out$sep\"$alias\":{\"pullRequests\":{\"nodes\":[$node]}}"
  sep=','
done
printf '%s}}\n' "$out"
