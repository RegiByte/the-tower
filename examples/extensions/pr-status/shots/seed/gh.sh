#!/bin/sh
# A stand-in for `gh` in the sandbox, which has no GitHub. `gh repo view` names a made-up repo, or a repo it is given by
# that name, as GitHub does for one never renamed; `gh api graphql` answers each branch alias (`-f b<i>=<branch>`) with one made-up pull request, as GitHub shapes it, by the branch's
# name: none (no pull request), merged, closed, draft, failing (open, its checks failing, a review required), else open
# and approved. Its head is the branch's tip in the repo `repo view` names, so it is taken for the branch's, pushed or not.
if [ "$1" = repo ]; then
  case $3 in
    */*/*) repo=${3#*/} ;;
    *) repo=example/lab ;;
  esac
  printf '{"nameWithOwner":"%s","url":"https://github.com/%s"}\n' "$repo" "$repo"
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
  node='{"number":42,"state":"'$state'","isDraft":'$draft',"url":"https://github.com/example/lab/pull/42","title":"Faster search over the archive","reviewDecision":'$review',"headRefOid":"'$(git rev-parse "$branch")'","createdAt":"'$(date -u +%FT%TZ)'","headRepository":{"nameWithOwner":"example/lab"},"commits":{"nodes":[{"commit":{"statusCheckRollup":{"state":'$checks'}}}]}}'
  out="$out$sep\"$alias\":{\"pullRequests\":{\"nodes\":[$node]}}"
  sep=','
done
printf '%s}}\n' "$out"
