"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CommentItem } from "@/entities/comment";
import type { CommentWithArticle } from "@/entities/comment";

interface CommentFeedProps {
  comments: CommentWithArticle[];
}

export function CommentFeed({ comments }: CommentFeedProps) {
  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-zinc-300">
          최근 댓글
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {comments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">
            댓글이 없습니다
          </p>
        ) : (
          <ScrollArea className="h-[400px]">
            {comments.map((comment) => (
              <CommentItem key={comment.id} comment={comment} />
            ))}
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
