// Comments' public API: a host imports from here and nowhere else in this folder.
// How it behaves, how it is built and how to bring it to another host: SPEC.md.

export { buildCommentPrompt, type CommentPromptInput, findNode, nameOf } from './model/prompt';
export { type AnchorRect, CommentCard } from './ui/comment-card';
