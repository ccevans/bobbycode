#!/usr/bin/env bash
# hooks/precompact.sh
#
# Claude Code PreCompact hook. Deliberately a no-op.
#
# It used to BLOCK every compaction until the agent wrote a checkpoint. That is
# wrong in two ways: a compaction forced by the context limit cannot be blocked
# (the request just fails), and a headless stage has nobody to answer the block.
# Checkpointing now happens at milestones inside each skill (see "Checkpointing"
# in bobby-build, bobby-test, bobby-ship, bobby-freewill), so compaction is safe
# at any moment, and hooks/postcompact-restore.sh puts the checkpoint back after.
#
# Kept as a file because existing projects' .claude/settings.json still names it.
cat >/dev/null
exit 0
